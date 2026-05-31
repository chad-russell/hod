//! Minimal xdg-desktop-portal frontend stub for early COSMIC VM bring-up.
//!
//! This provides org.freedesktop.portal.Desktop with the Settings interface
//! values libcosmic asks for at startup. It is intentionally not a full portal
//! implementation; replace with upstream xdg-desktop-portal once its deps are
//! packaged.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { cProfile } from "../../helpers/c.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { dbusRecipe } from "../dbus/dbus.js";

const recipe = await shellBuild({
  ...cProfile({
    includeDeps: ["dbus"],
    libDeps: ["dbus"],
    pkgConfigDeps: ["dbus"],
  }),
  script: `
mkdir -p /tmp/build
cat > /tmp/build/xdg-desktop-portal.c <<'EOF'
#include <dbus/dbus.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static DBusMessage *settings_read(DBusMessage *msg) {
    DBusError err;
    const char *ns = NULL;
    const char *key = NULL;
    dbus_error_init(&err);

    if (!dbus_message_get_args(msg, &err, DBUS_TYPE_STRING, &ns, DBUS_TYPE_STRING, &key, DBUS_TYPE_INVALID)) {
        DBusMessage *reply = dbus_message_new_error(msg, DBUS_ERROR_INVALID_ARGS, err.message ? err.message : "invalid args");
        dbus_error_free(&err);
        return reply;
    }

    if (strcmp(ns, "org.freedesktop.appearance") != 0) {
        return dbus_message_new_error(msg, DBUS_ERROR_FAILED, "unknown namespace");
    }

    DBusMessage *reply = dbus_message_new_method_return(msg);
    DBusMessageIter iter;
    DBusMessageIter variant;
    dbus_message_iter_init_append(reply, &iter);

    if (strcmp(key, "color-scheme") == 0) {
        dbus_uint32_t value = 1;
        dbus_message_iter_open_container(&iter, DBUS_TYPE_VARIANT, DBUS_TYPE_UINT32_AS_STRING, &variant);
        dbus_message_iter_append_basic(&variant, DBUS_TYPE_UINT32, &value);
        dbus_message_iter_close_container(&iter, &variant);
    } else if (strcmp(key, "contrast") == 0) {
        dbus_uint32_t value = 0;
        dbus_message_iter_open_container(&iter, DBUS_TYPE_VARIANT, DBUS_TYPE_UINT32_AS_STRING, &variant);
        dbus_message_iter_append_basic(&variant, DBUS_TYPE_UINT32, &value);
        dbus_message_iter_close_container(&iter, &variant);
    } else {
        dbus_message_unref(reply);
        return dbus_message_new_error(msg, DBUS_ERROR_FAILED, "unknown key");
    }

    return reply;
}

static DBusMessage *introspect(DBusMessage *msg) {
    const char *xml =
        "<node>"
        "  <interface name='org.freedesktop.portal.Settings'>"
        "    <method name='Read'>"
        "      <arg type='s' name='namespace' direction='in'/>"
        "      <arg type='s' name='key' direction='in'/>"
        "      <arg type='v' name='value' direction='out'/>"
        "    </method>"
        "  </interface>"
        "</node>";
    DBusMessage *reply = dbus_message_new_method_return(msg);
    dbus_message_append_args(reply, DBUS_TYPE_STRING, &xml, DBUS_TYPE_INVALID);
    return reply;
}

int main(void) {
    DBusError err;
    dbus_error_init(&err);

    DBusConnection *conn = dbus_bus_get(DBUS_BUS_SESSION, &err);
    if (!conn) {
        fprintf(stderr, "session bus failed: %s\\n", err.message ? err.message : "unknown");
        return 1;
    }

    int ret = dbus_bus_request_name(conn, "org.freedesktop.portal.Desktop", DBUS_NAME_FLAG_REPLACE_EXISTING, &err);
    if (ret != DBUS_REQUEST_NAME_REPLY_PRIMARY_OWNER) {
        fprintf(stderr, "request name failed: %s\\n", err.message ? err.message : "not primary owner");
        return 1;
    }

    for (;;) {
        dbus_connection_read_write(conn, -1);
        DBusMessage *msg = dbus_connection_pop_message(conn);
        if (!msg) continue;

        DBusMessage *reply = NULL;
        if (dbus_message_is_method_call(msg, "org.freedesktop.portal.Settings", "Read")) {
            reply = settings_read(msg);
        } else if (dbus_message_is_method_call(msg, "org.freedesktop.DBus.Introspectable", "Introspect")) {
            reply = introspect(msg);
        }

        if (reply) {
            dbus_connection_send(conn, reply, NULL);
            dbus_connection_flush(conn);
            dbus_message_unref(reply);
        }
        dbus_message_unref(msg);
    }
}
EOF

mkdir -p $OUT/bin $OUT/share/dbus-1/services
$CC $CFLAGS /tmp/build/xdg-desktop-portal.c -o $OUT/bin/xdg-desktop-portal \
  -I/deps/dbus/include/dbus-1.0 \
  -I/deps/dbus/lib/dbus-1.0/include \
  -L/deps/dbus/lib -ldbus-1 \
  $HOD_DUMMY_RPATH -Wl,-rpath-link,/deps/dbus/lib
$STRIP $OUT/bin/xdg-desktop-portal 2>/dev/null || true

cat > $OUT/share/dbus-1/services/org.freedesktop.portal.Desktop.service <<EOF
[D-BUS Service]
Name=org.freedesktop.portal.Desktop
Exec=/usr/hod/system/current/pkgs/xdg-desktop-portal/bin/xdg-desktop-portal
EOF
`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("dbus", dbusRecipe),
  ],
  runtime_deps: ["dbus", "toolchain"],
});

await importToStore(recipe);
export const xdgDesktopPortalStubRecipe = recipe;
