# REA operator notes

REA (**Reverse Engineer Anything**) supplies MCP and CLI tools for investigating shipped artifacts and application behavior. It is a development tool used during the PhpStorm workflow investigation, not a GitOrbit runtime dependency.

## Verified installation

The Windows development machine was configured with **rea-agents 6.3.0** on 2026-10-10:

| Item | Location |
| --- | --- |
| Package | `%LOCALAPPDATA%/REA/node_modules/rea-agents` |
| CLI entry point | `%LOCALAPPDATA%/REA/node_modules/rea-agents/scripts/rea.mjs` |
| Convenience launchers | `%LOCALAPPDATA%/REA/rea.cmd` and `rea.ps1` |
| User PATH entry | `%LOCALAPPDATA%/REA` |
| Codex configuration | `%USERPROFILE%/.codex/config.toml` |
| Configuration backup | `%USERPROFILE%/.codex/config.toml.rea.backup` |
| Installed skill | `%USERPROFILE%/.agents/skills/reverse-engineer-anything/SKILL.md` |

The MCP configuration starts the package's `scripts/rea.mjs mcp` entry point with the existing Codex Node runtime at `%USERPROFILE%/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`. That runtime was verified as **Node 24.19.0**. The default system Node 22 installation was too old, so the launchers use the compatible runtime explicitly.

The installed package requires Node `^22.19.0 || ^24.11.0 || >=26.0.0`. Do not assume any Node 22 installation is sufficient. These paths describe one configured machine; another operator should use their own compatible Node installation and setup-generated paths.

## Start and check

Open a new terminal after a PATH change, then run:

```powershell
rea --help
rea doctor --client codex --json
```

If the terminal has not picked up PATH yet, call the configured launcher directly:

```powershell
& "$env:LOCALAPPDATA/REA/rea.cmd" doctor --client codex --json
```

`setup --client codex --yes --json` completed on this machine, and doctor reported healthy configuration. An isolated stdio JSON-RPC connection independently verified the server identity **rea 6.3.0**, **139 tools**, and availability of `inspect_artifact`.

**Restart or reconnect Codex to load the MCP tools.** Installing the skill and writing MCP configuration cannot add tools to an already running chat. A healthy doctor result alone does not prove the current chat has connected. If tools remain unavailable after reconnection, inspect the MCP launch error rather than repeatedly reinstalling.

## Investigation workflow

1. Read the installed `reverse-engineer-anything/SKILL.md`; use the connected server's actual tool schemas.
2. Identify one exact local artifact and record its digest and version.
3. For a JAR/ZIP, bind the archive with `open_binary` and use `inspect_artifact` when available. Reuse matching session evidence.
4. Inspect packaged XML/resources with format-aware parsers to corroborate entry points. Keep observations, inferences and unknowns separate.
5. Preserve the evidence ID and limitations. The PhpStorm inventory and parity boundary are recorded in [`phpstorm-git-parity.md`](phpstorm-git-parity.md).
6. Use ordinary project tools to implement and test independently written GitOrbit functionality.

No Ghidra, Hopper, IDA or other native disassembler was installed for this archive/XML investigation. Archive inspection does not mean Java bytecode was decompiled, and static findings do not establish runtime behavior. Do not interpret a member format hint as proof of architecture; Java class and universal Mach-O magic values can collide.

For a fresh installation on another machine with a compatible Node runtime, pin the package and first review the scoped setup plan:

```powershell
npx -y rea-agents@6.3.0 doctor --client codex --json
npx -y rea-agents@6.3.0 setup --client codex --dry-run --json
```

After reviewing the plan and obtaining the operator's authorization for those configuration changes, apply the same scope:

```powershell
npx -y rea-agents@6.3.0 setup --client codex --yes --json
```

Keep raw evidence under ignored local directories; do not publish credentials, configuration dumps or private application content. Static analysis runs locally, while evidence supplied to an AI assistant is still handled according to that assistant's model/provider configuration.

See the [REA repository](https://github.com/morluto/rea) for supported targets and current setup documentation.
