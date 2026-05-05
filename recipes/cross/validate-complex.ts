//! validate-complex recipe — comprehensive gcc-stage1/glibc validation suite.
import { process, dep, importToStore, hermeticPreamble } from "../../js/src/index.js";
import { seedRootRecipe } from "../bootstrap/seed-root.js";
import { gccStage1Recipe } from "./gcc-stage1.js";
import { glibcRecipe } from "./glibc.js";
import { linuxHeadersRecipe } from "./linux-headers.js";

const preamble = hermeticPreamble({
  shell: "seed",
  muslLinker: "seed",
  glibcLinker: "glibc",
  sysroot: { glibc: "glibc", linuxHeaders: "linux-headers" },
});

const recipe = await process({
  platform: "x86_64-linux",
  command: "/deps/seed/bin/busybox",
  args: [
    "sh",
    "-c",
    `set -e

${preamble}

cat > /tmp/test_complex.c << 'CEOF'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <dirent.h>
#include <fcntl.h>
#include <signal.h>
#include <errno.h>
#include <time.h>
#include <sys/time.h>
#include <ftw.h>

static int pass = 0, fail = 0;

#define CHECK(cond, msg) do { \\
    if (cond) { printf("  PASS: %s\\n", msg); pass++; } \\
    else { printf("  FAIL: %s (errno=%d)\\n", msg, errno); fail++; } \\
} while(0)

void test_file_io(void) {
    printf("[file I/O]\\n");
    const char *path = "/tmp/validate_test_io";
    int fd = open(path, O_CREAT | O_WRONLY | O_TRUNC, 0644);
    CHECK(fd >= 0, "open for write");
    const char *data = "hello complex world";
    ssize_t w = write(fd, data, strlen(data));
    CHECK(w == (ssize_t)strlen(data), "write");
    close(fd);

    fd = open(path, O_RDONLY);
    CHECK(fd >= 0, "open for read");
    char buf[64] = {0};
    ssize_t r = read(fd, buf, sizeof(buf) - 1);
    CHECK(r == (ssize_t)strlen(data), "read back same length");
    CHECK(strcmp(buf, data) == 0, "read back same content");
    close(fd);
    unlink(path);
}

void test_stat(void) {
    printf("[stat]\\n");
    const char *path = "/tmp/validate_test_stat";
    int fd = open(path, O_CREAT | O_WRONLY, 0644);
    close(fd);
    struct stat st;
    CHECK(stat(path, &st) == 0, "stat regular file");
    CHECK(S_ISREG(st.st_mode), "S_ISREG");
    CHECK(st.st_size == 0, "empty file size");

    mkdir("/tmp/validate_test_dir", 0755);
    CHECK(stat("/tmp/validate_test_dir", &st) == 0, "stat directory");
    CHECK(S_ISDIR(st.st_mode), "S_ISDIR");

    unlink(path);
    rmdir("/tmp/validate_test_dir");
}

void test_dirent(void) {
    printf("[opendir/readdir]\\n");
    mkdir("/tmp/validate_test_opendir", 0755);
    // Create a few entries
    close(open("/tmp/validate_test_opendir/a", O_CREAT | O_WRONLY, 0644));
    close(open("/tmp/validate_test_opendir/b", O_CREAT | O_WRONLY, 0644));
    mkdir("/tmp/validate_test_opendir/c", 0755);

    DIR *d = opendir("/tmp/validate_test_opendir");
    CHECK(d != NULL, "opendir");
    int count = 0;
    struct dirent *ent;
    while ((ent = readdir(d)) != NULL) {
        if (strcmp(ent->d_name, ".") == 0 || strcmp(ent->d_name, "..") == 0)
            continue;
        count++;
    }
    CHECK(count == 3, "readdir found 3 entries");
    closedir(d);
    unlink("/tmp/validate_test_opendir/a");
    unlink("/tmp/validate_test_opendir/b");
    rmdir("/tmp/validate_test_opendir/c");
    rmdir("/tmp/validate_test_opendir");
}

void test_fork_exec_wait(void) {
    printf("[fork/exec/waitpid]\\n");
    pid_t pid = fork();
    CHECK(pid >= 0, "fork");
    if (pid == 0) {
        // Child: write to stdout and exit with 42
        write(1, "child", 5);
        _exit(42);
    }
    // Parent
    int status;
    pid_t wp = waitpid(pid, &status, 0);
    CHECK(wp == pid, "waitpid returns child pid");
    CHECK(WIFEXITED(status), "child exited normally");
    CHECK(WEXITSTATUS(status) == 42, "child exit code 42");

    // Test exec: have child run /bin/true equivalent via busybox
    // We'll just test execv with the seed's busybox echo
    pid = fork();
    if (pid == 0) {
        char *argv[] = {"/deps/seed/bin/busybox", "echo", "exec works", NULL};
        execv("/deps/seed/bin/busybox", argv);
        _exit(1);  // shouldn't reach
    }
    waitpid(pid, &status, 0);
    CHECK(WIFEXITED(status) && WEXITSTATUS(status) == 0, "execv busybox echo");
}

void test_pipe(void) {
    printf("[pipe]\\n");
    int pipefd[2];
    CHECK(pipe(pipefd) == 0, "pipe");
    const char *msg = "through the pipe";
    write(pipefd[1], msg, strlen(msg));
    close(pipefd[1]);
    char buf[64] = {0};
    read(pipefd[0], buf, sizeof(buf) - 1);
    close(pipefd[0]);
    CHECK(strcmp(buf, msg) == 0, "pipe data round-trip");
}

void test_signal(void) {
    printf("[signal]\\n");
    volatile sig_atomic_t caught = 0;
    void handler(int sig) { caught = sig; }
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = handler;
    sigaction(SIGUSR1, &sa, NULL);
    kill(getpid(), SIGUSR1);
    CHECK(caught == SIGUSR1, "SIGUSR1 caught");
}

void test_time(void) {
    printf("[time]\\n");
    time_t t = time(NULL);
    CHECK(t > 1000000000, "time() returns reasonable epoch");
    struct timeval tv;
    CHECK(gettimeofday(&tv, NULL) == 0, "gettimeofday");
    CHECK(tv.tv_sec > 1000000000, "gettimeofday seconds reasonable");
    struct timespec ts;
    CHECK(clock_gettime(CLOCK_REALTIME, &ts) == 0, "clock_gettime REALTIME");
    CHECK(clock_gettime(CLOCK_MONOTONIC, &ts) == 0, "clock_gettime MONOTONIC");
}

void test_env(void) {
    printf("[getenv/setenv]\\n");
    setenv("HOD_TEST_VAR", "test123", 1);
    CHECK(strcmp(getenv("HOD_TEST_VAR"), "test123") == 0, "setenv/getenv round-trip");
    unsetenv("HOD_TEST_VAR");
    CHECK(getenv("HOD_TEST_VAR") == NULL, "unsetenv clears");
}

void test_malloc(void) {
    printf("[malloc/realloc]\\n");
    char *p = malloc(1024);
    CHECK(p != NULL, "malloc 1KB");
    memset(p, 'A', 1024);
    p = realloc(p, 4096);
    CHECK(p != NULL, "realloc to 4KB");
    CHECK(p[0] == 'A', "realloc preserved content");
    free(p);

    // Large allocation
    p = malloc(1024 * 1024);  // 1MB
    CHECK(p != NULL, "malloc 1MB");
    memset(p, 'B', 1024 * 1024);
    CHECK(p[0] == 'B', "1MB write succeeded");
    free(p);
}

void test_snprintf(void) {
    printf("[snprintf]\\n");
    char buf[64];
    int n = snprintf(buf, sizeof(buf), "%d %s %f", 42, "hello", 3.14);
    CHECK(n > 0, "snprintf returns positive");
    CHECK(strcmp(buf, "42 hello 3.140000") == 0, "snprintf formatted correctly");
}

void test_symlink(void) {
    printf("[symlink/readlink]\\n");
    const char *target = "/tmp/validate_test_link_target";
    const char *link = "/tmp/validate_test_link";
    close(open(target, O_CREAT | O_WRONLY, 0644));
    CHECK(symlink(target, link) == 0, "symlink");
    char buf[256];
    ssize_t r = readlink(link, buf, sizeof(buf) - 1);
    CHECK(r >= 0, "readlink");
    buf[r] = 0;
    CHECK(strcmp(buf, target) == 0, "readlink matches target");
    struct stat st;
    CHECK(lstat(link, &st) == 0, "lstat on symlink");
    CHECK(S_ISLNK(st.st_mode), "S_ISLNK");
    unlink(target);
    unlink(link);
}

int main(void) {
    printf("=== Complex gcc-stage1/glibc validation ===\\n");
    test_file_io();
    test_stat();
    test_dirent();
    test_fork_exec_wait();
    test_pipe();
    test_signal();
    test_time();
    test_env();
    test_malloc();
    test_snprintf();
    test_symlink();
    printf("\\n=== Results: %d passed, %d failed ===\\n", pass, fail);
    return fail > 0 ? 1 : 0;
}
CEOF

# Compile
echo "Compiling complex test program..."
/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc \\
  --sysroot=/tmp/sysroot \\
  -B/deps/seed/bin/ \\
  -L/deps/gcc-stage1/lib \\
  -L/deps/gcc-stage1/lib/gcc/x86_64-linux-gnu/13.2.0 \\
  -no-pie \\
  -o /tmp/test_complex \\
  /tmp/test_complex.c

echo "Compilation succeeded, running test binary..."
/tmp/test_complex > $OUT/output.txt 2>&1
RESULT=$?

cp /tmp/test_complex $OUT/test_binary

echo "Exit code: $RESULT" >> $OUT/output.txt

if [ $RESULT -ne 0 ]; then
  echo "FAILED: test binary exited with code $RESULT"
  cat $OUT/output.txt
  exit 1
fi

echo "Complex validation complete"`,
  ],
  env: [
    { key: "C_INCLUDE_PATH", value: "/deps/gcc-stage1/include:/deps/glibc/include:/deps/linux-headers/include" },
  ],
  dependencies: [
    dep("gcc-stage1", gccStage1Recipe),
    dep("glibc", glibcRecipe),
    dep("linux-headers", linuxHeadersRecipe),
    dep("seed", seedRootRecipe),
  ],
});

await importToStore(recipe);
export const validateComplexRecipe = recipe;
