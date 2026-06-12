/*
 * hod-launcher — tiny static argv[0]-preserving wrapper.
 *
 * Built as a single content-hashed, statically-linked (musl) ELF and stamped
 * over each wrapped executable by the Hod build system. It is the compiled
 * replacement for the legacy POSIX-shell wrappers in src/wrap.rs.
 *
 * At runtime it:
 *
 *   1. Resolves its own path via /proc/self/exe (no $0 walk, no readlink of a
 *      symlink chain, no dependence on PATH or /bin/sh).
 *   2. Derives:
 *        exe_dir      = dirname(/proc/self/exe)              .../<hex>/bin
 *        prefix       = dirname(exe_dir)                     .../<hex>
 *        staging_root = dirname(dirname(dirname(exe_dir)))   .../staging
 *      (three levels above bin/, matching the $ORIGIN/../../../<shard>/<hash>
 *      convention used by src/relocate.rs.)
 *   3. Reads its per-binary manifest at  exe_dir/.hod-launcher/<basename>.
 *   4. Applies the manifest's env operations, expanding the tokens
 *        @self@   -> prefix
 *        @store@  -> staging_root
 *   5. execv's the real binary (default exe_dir/_hod_wrapped/<basename>, or the
 *      manifest's EXEC line) with argv[0] preserved (or overridden), and any
 *      injected flags inserted before the user's arguments.
 *
 * Manifest format (v1): see src/manifest.rs.
 *
 * Failure philosophy: if the manifest is missing/unreadable, still attempt to
 * exec the default real-binary location so a broken manifest degrades to "run
 * without the extra env" rather than a hard failure.
 */

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define TOKEN_SELF "@self@"
#define TOKEN_STORE "@store@"
#define MAGIC "HODLAUNCH1"

static void die(const char *msg) {
    fprintf(stderr, "hod-launcher: %s\n", msg);
    _exit(127);
}

static char *xstrdup(const char *s) {
    size_t n = strlen(s) + 1;
    char *p = (char *)malloc(n);
    if (!p) die("out of memory");
    memcpy(p, s, n);
    return p;
}

/* Truncate `path` in place at its last '/'; returns path. Root stays "/". */
static char *dirname_inplace(char *path) {
    char *slash = strrchr(path, '/');
    if (!slash) {
        path[0] = '.';
        path[1] = '\0';
        return path;
    }
    if (slash == path) {
        path[1] = '\0'; /* "/" */
        return path;
    }
    *slash = '\0';
    return path;
}

static const char *basename_ptr(const char *path) {
    const char *slash = strrchr(path, '/');
    return slash ? slash + 1 : path;
}

/*
 * Replace every occurrence of `from` in `src` with `to`. Returns a freshly
 * malloc'd string. Used to expand @self@/@store@ tokens.
 */
static char *replace_all(const char *src, const char *from, const char *to) {
    size_t from_len = strlen(from);
    size_t to_len = strlen(to);
    if (from_len == 0) return xstrdup(src);

    /* Count occurrences for exact allocation. */
    size_t count = 0;
    const char *p = src;
    while ((p = strstr(p, from)) != NULL) {
        count++;
        p += from_len;
    }

    size_t src_len = strlen(src);
    size_t out_len = src_len + count * (to_len - from_len);
    char *out = (char *)malloc(out_len + 1);
    if (!out) die("out of memory");

    char *w = out;
    p = src;
    while (1) {
        const char *hit = strstr(p, from);
        if (!hit) {
            strcpy(w, p);
            break;
        }
        size_t chunk = (size_t)(hit - p);
        memcpy(w, p, chunk);
        w += chunk;
        memcpy(w, to, to_len);
        w += to_len;
        p = hit + from_len;
    }
    return out;
}

/* Expand @self@ and @store@ tokens in `value`. */
static char *expand_tokens(const char *value, const char *prefix, const char *staging_root) {
    char *a = replace_all(value, TOKEN_SELF, prefix);
    char *b = replace_all(a, TOKEN_STORE, staging_root);
    free(a);
    return b;
}

/* Read an entire file into a malloc'd NUL-terminated buffer, or NULL. */
static char *read_file(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    if (fseek(f, 0, SEEK_END) != 0) {
        fclose(f);
        return NULL;
    }
    long sz = ftell(f);
    if (sz < 0) {
        fclose(f);
        return NULL;
    }
    rewind(f);
    char *buf = (char *)malloc((size_t)sz + 1);
    if (!buf) {
        fclose(f);
        die("out of memory");
    }
    size_t got = fread(buf, 1, (size_t)sz, f);
    fclose(f);
    buf[got] = '\0';
    return buf;
}

/* Skip leading spaces. */
static char *skip_spaces(char *s) {
    while (*s == ' ') s++;
    return s;
}

/* Read one space-delimited token, NUL-terminating it; returns rest-of-line. */
static char *next_token(char *s, char **tok) {
    s = skip_spaces(s);
    *tok = s;
    while (*s && *s != ' ') s++;
    if (*s) {
        *s = '\0';
        s++;
    }
    return s;
}

int main(int argc, char **argv) {
    /* 1. Resolve /proc/self/exe. */
    char exe[4096];
    ssize_t n = readlink("/proc/self/exe", exe, sizeof(exe) - 1);
    if (n <= 0) die("cannot read /proc/self/exe");
    exe[n] = '\0';

    /* 2. Derive paths. */
    char *exe_dir = xstrdup(exe);
    dirname_inplace(exe_dir);              /* .../<hex>/bin */
    char *prefix = xstrdup(exe_dir);
    dirname_inplace(prefix);               /* .../<hex> */
    char *staging_root = xstrdup(prefix);
    dirname_inplace(staging_root);         /* .../staging/<shard>  -> drop shard */
    dirname_inplace(staging_root);         /* .../staging */

    const char *name = basename_ptr(exe);

    /* Default real binary: exe_dir/_hod_wrapped/<name>. */
    char default_exec[8192];
    snprintf(default_exec, sizeof(default_exec), "%s/_hod_wrapped/%s", exe_dir, name);
    char *exec_path = xstrdup(default_exec);

    /* 3. Read the manifest: exe_dir/.hod-launcher/<name>. */
    char manifest_path[8192];
    snprintf(manifest_path, sizeof(manifest_path), "%s/.hod-launcher/%s", exe_dir, name);
    char *manifest = read_file(manifest_path);

    /* argv plan. */
    char *argv0 = argv[0]; /* inherit by default */
    char **flags = (char **)calloc((size_t)argc + 1, sizeof(char *));
    if (!flags) die("out of memory");
    int nflags = 0;

    if (manifest) {
        char *line = manifest;
        int first = 1;
        while (*line) {
            char *eol = strchr(line, '\n');
            if (eol) *eol = '\0';

            /* Trim a trailing CR if present. */
            size_t llen = strlen(line);
            if (llen && line[llen - 1] == '\r') line[llen - 1] = '\0';

            if (first) {
                if (strcmp(line, MAGIC) != 0) die("bad manifest magic");
                first = 0;
            } else if (*line) {
                char *rest = line;
                char *op;
                rest = next_token(rest, &op);
                if (strcmp(op, "EXEC") == 0) {
                    free(exec_path);
                    exec_path = expand_tokens(skip_spaces(rest), prefix, staging_root);
                } else if (strcmp(op, "SET") == 0) {
                    char *var;
                    rest = next_token(rest, &var);
                    char *val = expand_tokens(skip_spaces(rest), prefix, staging_root);
                    setenv(var, val, 1);
                    free(val);
                } else if (strcmp(op, "SETDEFAULT") == 0) {
                    char *var;
                    rest = next_token(rest, &var);
                    const char *cur = getenv(var);
                    if (!cur || !*cur) {
                        char *val = expand_tokens(skip_spaces(rest), prefix, staging_root);
                        setenv(var, val, 1);
                        free(val);
                    }
                } else if (strcmp(op, "UNSET") == 0) {
                    char *var;
                    next_token(rest, &var);
                    unsetenv(var);
                } else if (strcmp(op, "PREFIX") == 0 || strcmp(op, "SUFFIX") == 0) {
                    int is_prefix = (op[0] == 'P');
                    char *var;
                    char *sep;
                    rest = next_token(rest, &var);
                    rest = next_token(rest, &sep);
                    char *val = expand_tokens(skip_spaces(rest), prefix, staging_root);
                    const char *cur = getenv(var);
                    if (!cur || !*cur) {
                        setenv(var, val, 1);
                    } else {
                        size_t need = strlen(val) + strlen(sep) + strlen(cur) + 1;
                        char *combined = (char *)malloc(need);
                        if (!combined) die("out of memory");
                        if (is_prefix) {
                            snprintf(combined, need, "%s%s%s", val, sep, cur);
                        } else {
                            snprintf(combined, need, "%s%s%s", cur, sep, val);
                        }
                        setenv(var, combined, 1);
                        free(combined);
                    }
                    free(val);
                } else if (strcmp(op, "FLAG") == 0) {
                    flags[nflags++] = expand_tokens(skip_spaces(rest), prefix, staging_root);
                } else if (strcmp(op, "ARGV0") == 0) {
                    argv0 = expand_tokens(skip_spaces(rest), prefix, staging_root);
                } else if (strcmp(op, "INHERIT_ARGV0") == 0) {
                    argv0 = argv[0];
                }
                /* Unknown ops are ignored for forward compatibility. */
            }

            if (!eol) break;
            line = eol + 1;
        }
    }

    /* 4. Build the new argv: argv0, flags..., user args (argv[1..]), NULL. */
    int user_args = (argc > 1) ? (argc - 1) : 0;
    int total = 1 + nflags + user_args;
    char **new_argv = (char **)calloc((size_t)total + 1, sizeof(char *));
    if (!new_argv) die("out of memory");

    int idx = 0;
    new_argv[idx++] = argv0;
    for (int i = 0; i < nflags; i++) new_argv[idx++] = flags[i];
    for (int i = 1; i < argc; i++) new_argv[idx++] = argv[i];
    new_argv[idx] = NULL;

    /* 5. Exec the real binary. */
    execv(exec_path, new_argv);

    /* execv only returns on error. */
    fprintf(stderr, "hod-launcher: failed to exec %s: %s\n", exec_path, strerror(errno));
    _exit(127);
}
