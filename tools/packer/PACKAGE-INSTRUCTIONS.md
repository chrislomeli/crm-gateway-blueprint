Directory Package Format Documentation
Overview
This format packages an entire directory structure into a single text file, making it easy to share code with LLMs or in text-based formats where file attachments aren't possible.
Packed File Structure
markdown# Directory Package: [root_directory_name]
# Total files: [count]
################################################################################

### FILE: path/to/first/file.ext
[file contents here]

### FILE: path/to/second/file.ext
[file contents here]

Format Rules

Header Section (Lines 1-3)

Line 1: Package name from root directory
Line 2: Total file count
Line 3: 80 hash marks as separator


File Entries

Each file starts with ### FILE: [relative/path]
File path is relative to root directory
Content wrapped in triple backticks (```)
Empty line between file entries


Content Preservation

File contents are exact copies
Encoding: UTF-8
Line endings preserved as-is



Usage Examples
Packing a Directory
bash# Package entire project
./pack.py pack ./my-project ./my-project.md

# Package only specific file types
./pack.py pack ./src ./src-code.md --extensions .ts .tsx .json
Unpacking a Package
bash# Recreate directory structure
./pack.py unpack ./my-project.md ./restored-project

# Overwrite existing files
./pack.py unpack ./my-project.md ./output --overwrite
For LLMs/Parsing
When providing a packed file to an LLM:

The LLM can read the entire structure at once
File boundaries are clear with ### FILE: markers
Code blocks preserve syntax highlighting hints

When asking an LLM to generate a packed structure:

Request output in "packed directory format"
Specify the exact format: ### FILE: markers with ``` blocks
The structure can be directly unpacked using the script

Default Included Extensions
Text/Config: .yaml, .yml, .txt, .md, .json, .xml, .env, .ini, .toml, .conf, .config
Code: .py, .js, .ts, .java, .go, .rs, .rb, .jsx, .tsx, .vue, .svelte
Shell: .sh, .bash, .zsh, .fish
Web: .html, .css, .scss, .less
Data: .sql, .graphql, .proto, .thrift
Build: Dockerfile, Makefile, Jenkinsfile, etc.
Excluded Directories
Always skipped: .git, __pycache__, node_modules, .venv, venv, dist, build, .idea, .vscode