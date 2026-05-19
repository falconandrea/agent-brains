# 🤖 agents-skills-custom

Central repository for AI agent configurations, skills, and project templates.

## Structure

```
├── .opencode/              # → Symlinked to projects (OpenCode)
│   ├── agents/             #   Agent definitions (markdown)
│   └── skills/             #   Skill definitions (markdown)
│
├── .agents/                # → Symlinked to projects (Antigravity/Gemini)
│   ├── workflows/          #   Workflow agent definitions (markdown)
│   └── skills/             #   Skills (including Laravel Boost)
│
├── templates/              # → Copied to projects (project-specific context)
│   └── .ai/
│       ├── context/        #   PRD, APP_FLOW, TECH_STACK, ROADMAP, DB schema
│       ├── features/       #   Feature tracking template
│       └── memory/         #   lessons.md, progress.md
│
├── setup.sh                # Create agent/skill symlinks
├── scaffold.sh             # Copy .ai templates to a project
└── unlink.sh               # Remove symlinks
```

## Quick Start

### 1. New project — full setup

```bash
# Link agents & skills (symlink — shared, always up to date)
./setup.sh /path/to/your-project

# Scaffold .ai context structure (copy — project-specific)
./scaffold.sh /path/to/your-project
```

### 2. Link agents only

```bash
./setup.sh /path/to/your-project opencode   # or "agents"
```

### 3. Unlink

```bash
./unlink.sh /path/to/your-project
```

## How It Works

### Agents & Skills → Symlink (shared)

```
project-a/.opencode  →  symlink  →  this-repo/.opencode
project-b/.opencode  →  symlink  →  this-repo/.opencode
project-c/.agents    →  symlink  →  this-repo/.agents
```

Edit a file here → change is immediately available in **every linked project**.

### Project Context (.ai) → Copy (project-specific)

```
this-repo/templates/.ai/  ──copy──→  project-a/.ai/  (independent)
                           ──copy──→  project-b/.ai/  (independent)
```

Each project gets its own copy. PRD, roadmap, DB schema are unique per project.

### Laravel Boost Skills

When you run `laravel-boost update` in any linked project, it updates files in `.agents/skills/` which physically live in this repo. All other linked projects automatically get the update.

## Notes

- `.opencode` and `.agents` are **personal dev configs** (like `.vscode/`) → `.gitignore`
- `.ai/` is **project documentation** → commit to the project repo
- Safe for open source: agent configs are personal, project context is committed
