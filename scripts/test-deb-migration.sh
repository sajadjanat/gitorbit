#!/usr/bin/env bash
set -euo pipefail

# Exercise actual dpkg package ownership without touching the runner's package DB.
root=$(mktemp -d)
old="$root/legacy.deb"
new=$(find src-tauri/target/release/bundle/deb -maxdepth 1 -name '*.deb' -print -quit)
test -n "$new"
curl --fail --location --retry 3 --output "$old" \
  https://github.com/sajadjanat/gitorbit/releases/download/v0.3.2/Workspace.Monitor_0.3.2_amd64.deb

for package in "$old" "$new"; do
  # These bundles must have no maintainer scripts that could escape the test root.
  if dpkg-deb --ctrl-tarfile "$package" | tar -tf - | grep -Eq '(^|/)(preinst|postinst|prerm|postrm)$'; then
    echo 'Unexpected maintainer script in migration fixture' >&2
    exit 1
  fi
done

data="$root/home/test/.config/ir.sepehra.workspace-monitor/workspaces.json"
mkdir -p "$(dirname "$data")"
printf '%s\n' '{"workspaces":[{"name":"Existing workspace","path":"/projects/example"}]}' > "$data"
before=$(sha256sum "$data")
sudo dpkg --root="$root" --force-depends --install "$old"
sudo dpkg --root="$root" --force-depends --install "$new"
test "$(dpkg-query --admindir="$root/var/lib/dpkg" -W -f='${Status}' git-orbit)" = 'install ok installed'
legacy=$(dpkg-query --admindir="$root/var/lib/dpkg" -W -f='${Status}' workspace-monitor 2>/dev/null || true)
test "$legacy" != 'install ok installed'
test -x "$root/usr/bin/workspace-monitor"
grep -Rq '^Name=GitOrbit$' "$root/usr/share/applications"
test "$(sha256sum "$data")" = "$before"
echo 'Legacy DEB replaced successfully; GitOrbit installed and workspace data preserved.'
