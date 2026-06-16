# agent-setting-manager (asm)

A CLI tool to manage AI agent configuration files across **Claude Code**, **Claude Desktop**, and **Cursor** from a single `agent.json` manifest.

## Why

Setting up AI agent configs (skills, rules, MCP servers, agent instructions) manually across multiple platforms is repetitive and error-prone. `asm` lets you define everything once in `agent.json` and install it everywhere with one command.

## Prerequisites

- **Node.js 18+**
- For MCP server installation: `npx add-mcp` must be available (bundled with Node.js via npx)
- **Windows note:** Symlink creation for `CLAUDE.md` requires Developer Mode or admin privileges. If unavailable, `asm` falls back to writing a plain `CLAUDE.md` containing `read AGENT.md`.

## Installation

```bash
npm install -g agent-setting-manager
```

Or run directly with npx:

```bash
npx agent-setting-manager init
```

### Install via AI Agent

You can ask your AI agent (Claude Code, Cursor, etc.) to install and set up `asm` in your project by sending this prompt:

```
Install and set up the `asm` (agent-setting-manager) CLI tool in this project.

Steps:
1. Check if Node.js 18+ is available.
   - If not found, try to install it using a version manager appropriate for the current OS (e.g. nvm, fnm, or a system package manager).
   - If you cannot install it automatically, stop and give me clear instructions to install Node.js 18+ manually for my OS before continuing.
2. Install the CLI globally: `npm install -g agent-setting-manager`
3. Run `asm init` in the project root to create `agent.json` and `agent-log.json`.
4. Verify the setup by running `asm --help`.

Once done, show me the contents of the generated `agent.json` so I can review it.
```

## Quick Start

```bash
# 1. Initialize a manifest in your project
asm init

# 2. Add artifacts
asm add --skill --name "code-review" --source "./skills/code-review.md"
asm add --rule --name "no-console" --source "./rules/no-console.md"
asm add --agentFile --source "./AGENT.md"
asm add --mcp --name "figma" --source "@figma/mcp" --targets claude cursor

# 3. Install to platforms
asm install --target claude cursor
```

## Commands

### `asm init`

Creates `agent.json` and `agent-log.json` in the current directory.

```bash
asm init [--path <path>] [--force]
```

| Option | Description |
|--------|-------------|
| `--path <path>` | Custom location for `agent.json` (default: project root) |
| `--force` | Overwrite existing `agent.json` |

---

### `asm install`

Installs all artifacts defined in `agent.json` to the specified platforms.

```bash
asm install --target <targets...>
```

| Option | Description |
|--------|-------------|
| `--target <targets...>` | One or more platforms: `claude`, `cursor` |

**Example:**
```bash
asm install --target claude cursor
```

---

### `asm add`

Registers a new artifact in `agent.json` and installs it to all previously used platforms.

```bash
# Add a skill
asm add --skill --name "deploy-to-vercel" --source "https://example.com/skill.md"
asm add --skill --name "my-skill" --package "my-skill-npm-pkg"

# Add multiple skills at once
asm add --skill --name "skill-a" --source "./a.md" --name "skill-b" --source "./b.md"

# Add a rule
asm add --rule --name "no-console" --source "./rules/no-console.md"

# Add an agent file
asm add --agentFile --source "./AGENT.md"

# Add an MCP server
asm add --mcp --name "figma" --source "@figma/mcp" --targets claude cursor
asm add --mcp --name "my-api" --source "https://api.example.com/mcp" --targets cursor --transport http
```

If an artifact with the same name already exists, you will be prompted:
```
'code-review' already exists — [s]top or [o]verwrite?
```

---

### `asm update`

Re-fetches artifact sources and overwrites installed files on all platforms.

```bash
# Update a specific skill
asm update --skill --name "code-review"

# Update all skills
asm update --skill

# Update everything
asm update
```

---

### `asm remove`

Uninstalls artifacts from all platforms and removes them from `agent.json`.

```bash
asm remove --skill --name "code-review"
asm remove --skill --name "skill-a" "skill-b"
asm remove --rule --name "no-console"
asm remove --agentFile
asm remove --mcp --name "figma"
```

---

## agent.json Schema

```json
{
  "version": "1.0.0",
  "agentFile": {
    "source": "./AGENT.md"
  },
  "skills": [
    { "name": "code-review", "source": "./skills/code-review.md" },
    { "name": "my-skill", "package": "my-skill-npm-pkg" }
  ],
  "rules": [
    { "name": "no-console", "source": "https://example.com/rules/no-console.md" }
  ],
  "mcps": [
    {
      "name": "figma",
      "source": "@figma/mcp",
      "targets": ["claude", "cursor"]
    }
  ]
}
```

Commit `agent.json` to version control so your whole team shares the same configuration.

---

## Installation Paths

| Platform | Artifact | Installed path |
|----------|----------|----------------|
| Claude Code | skill | `.claude/skills/<name>/SKILL.md` |
| Claude Code | rule | `.claude/rules/<name>.md` |
| Claude Code | agentFile | `AGENT.md` + `CLAUDE.md` (symlink) |
| Claude Desktop | mcp | via `npx add-mcp` |
| Cursor | skill | `.cursor/skills/<name>/SKILL.md` |
| Cursor | rule | `.cursor/rules/<name>.md` |
| Cursor | agentFile | `AGENTS.md` |
| Cursor | mcp | via `npx add-mcp` |

---

## Error Handling

- **Source not found:** Skips the artifact and continues; exits non-zero at the end.
- **Partial failure:** Successful artifacts are installed; failures are summarized at the end.
- **Duplicate on add:** Interactive prompt (non-interactive/CI environments treat duplicate as a stop).
- **Missing log entry:** Warns and attempts removal/update at the expected convention path; exits 0.

---

## License

[MIT](./LICENSE)
