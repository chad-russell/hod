import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
mkdir -p $OUT/bin $OUT/lib/systemd/system

cat > /tmp/hod-heartbeat.c << 'CEOF'
#include <stdio.h>
#include <time.h>
#include <unistd.h>

int main(void) {
    time_t now;
    char buf[64];
    for (;;) {
        now = time(NULL);
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S%z", localtime(&now));
        printf("%s hod-heartbeat alive\\n", buf);
        fflush(stdout);
        sleep(10);
    }
    return 0;
}
CEOF

$CC $CFLAGS $LDFLAGS -o $OUT/bin/hod-heartbeat /tmp/hod-heartbeat.c
/deps/toolchain/bin/strip $OUT/bin/hod-heartbeat 2>/dev/null || true

cat > $OUT/lib/systemd/system/hod-heartbeat.service << 'SVEOF'
[Unit]
Description=Hod Heartbeat Service

[Service]
ExecStart=/usr/hod/system/current/pkgs/hod-heartbeat/bin/hod-heartbeat
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVEOF
`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const hodHeartbeatRecipe = recipe;
