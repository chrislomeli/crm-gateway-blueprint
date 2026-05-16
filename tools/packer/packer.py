#!/usr/bin/env python3
"""
Directory Package Utilities

Two utilities for packaging/unpackaging directory structures into a single text file.
Perfect for sharing code structures with LLMs or in text-based formats.
"""

import os
import sys
import argparse
from pathlib import Path
from typing import Set, List

# Default extensions to include (only text files)
DEFAULT_EXTENSIONS = {
    '.yaml', '.yml', '.txt', '.md', '.json', '.xml',
    '.py', '.js', '.ts', '.java', '.go', '.rs', '.rb',
    '.sh', '.bash', '.zsh', '.fish',
    '.html', '.css', '.scss', '.less',
    '.sql', '.graphql',
    '.env', '.ini', '.toml', '.conf', '.config',
    '.dockerfile', '.dockerignore', '.gitignore',
    '.jsx', '.tsx', '.vue', '.svelte',
    '.proto', '.thrift',
    '.mk', '.makefile',
    '.tpl', '.tmpl', '.template'
}

# Files to always include regardless of extension
INCLUDE_FILES = {
    'Dockerfile', 'Makefile', 'Jenkinsfile', 'Vagrantfile',
    'Gemfile', 'Rakefile', 'Procfile', '.helmignore',
    'kustomization.yaml', 'Chart.yaml'
}

# Directories to skip
SKIP_DIRS = {
    '.git', '__pycache__', 'node_modules', '.venv', 'venv',
    'env', '.env', 'dist', 'build', '.pytest_cache',
    '.idea', '.vscode', '.DS_Store'
}


def package_reader(root_dir: str, output_file: str, extensions: Set[str] = None):
    """
    Walk a directory tree and package all text files into a single master file.

    Args:
        root_dir: Directory to package
        output_file: Output file path
        extensions: Set of file extensions to include (with dots)
    """
    root_path = Path(root_dir).resolve()
    extensions = extensions or DEFAULT_EXTENSIONS

    if not root_path.exists():
        print(f"Error: Directory '{root_dir}' does not exist")
        return False

    packaged_files = []

    for dirpath, dirnames, filenames in os.walk(root_path):
        # Skip unwanted directories
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in sorted(filenames):
            file_path = Path(dirpath) / filename
            relative_path = file_path.relative_to(root_path)

            # Check if file should be included
            should_include = (
                filename in INCLUDE_FILES or
                any(filename.endswith(ext) for ext in extensions)
            )

            if should_include:
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()

                    packaged_files.append({
                        'path': str(relative_path),
                        'content': content
                    })
                    print(f"  Added: {relative_path}")

                except (UnicodeDecodeError, PermissionError) as e:
                    print(f"  Skipped (error): {relative_path} - {e}")

    # Write the master file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"# Directory Package: {root_path.name}\n")
        f.write(f"# Total files: {len(packaged_files)}\n")
        f.write("#" * 80 + "\n\n")

        for item in packaged_files:
            f.write(f"### FILE: {item['path']}\n")
            f.write("```\n")
            f.write(item['content'])
            if not item['content'].endswith('\n'):
                f.write('\n')
            f.write("```\n\n")

    print(f"\nPackaged {len(packaged_files)} files into '{output_file}'")
    return True


def package_writer(master_file: str, output_dir: str, overwrite: bool = False):
    """
    Read a master file and recreate the directory structure.

    Args:
        master_file: Path to the master file
        output_dir: Directory to create the structure in
        overwrite: Whether to overwrite existing files
    """
    if not Path(master_file).exists():
        print(f"Error: Master file '{master_file}' does not exist")
        return False

    output_path = Path(output_dir)

    # Create output directory if it doesn't exist
    output_path.mkdir(parents=True, exist_ok=True)

    with open(master_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_file = None
    current_content = []
    files_written = 0
    in_code_block = False

    for line in lines:
        # Check for file marker
        if line.startswith("### FILE: ") and not in_code_block:
            # Write previous file if exists
            if current_file and current_content:
                file_path = output_path / current_file

                # Check if file exists
                if file_path.exists() and not overwrite:
                    print(f"  Skipped (exists): {current_file}")
                else:
                    # Create parent directories
                    file_path.parent.mkdir(parents=True, exist_ok=True)

                    # Write file
                    with open(file_path, 'w', encoding='utf-8') as f:
                        content = ''.join(current_content)
                        # Remove the last newline if it was added by our code block
                        if content.endswith('\n```\n'):
                            content = content[:-5] + '```'
                        f.write(content)

                    print(f"  Wrote: {current_file}")
                    files_written += 1

            # Start new file
            current_file = line[10:].strip()
            current_content = []

        elif line.strip() == "```":
            in_code_block = not in_code_block
            if not in_code_block and current_content and current_content[-1] == "```\n":
                # This is the ending ``` - don't include it in content
                current_content = current_content[:-1]
        elif current_file and in_code_block:
            current_content.append(line)

    # Write last file if exists
    if current_file and current_content:
        file_path = output_path / current_file
        if file_path.exists() and not overwrite:
            print(f"  Skipped (exists): {current_file}")
        else:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(''.join(current_content))
            print(f"  Wrote: {current_file}")
            files_written += 1

    print(f"\nUnpacked {files_written} files to '{output_dir}'")
    return True


def main():
    parser = argparse.ArgumentParser(
        description='Package/unpackage directory structures to/from a single text file',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Package a directory
  %(prog)s pack ./my-project ./my-project.md

  # Unpack a master file
  %(prog)s unpack ./my-project.md ./restored-project

  # Package only yaml and json files
  %(prog)s pack ./configs ./configs.md --extensions .yaml .yml .json

  # Unpack with overwrite
  %(prog)s unpack ./my-project.md ./output --overwrite
        """
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to run')

    # Pack command
    pack_parser = subparsers.add_parser('pack', help='Package a directory into a master file')
    pack_parser.add_argument('directory', help='Directory to package')
    pack_parser.add_argument('output', help='Output master file')
    pack_parser.add_argument('--extensions', nargs='+',
                            help='File extensions to include (e.g., .yaml .md .py)')

    # Unpack command
    unpack_parser = subparsers.add_parser('unpack', help='Unpack a master file into a directory')
    unpack_parser.add_argument('master_file', help='Master file to unpack')
    unpack_parser.add_argument('output_dir', help='Output directory')
    unpack_parser.add_argument('--overwrite', action='store_true',
                              help='Overwrite existing files')

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    if args.command == 'pack':
        extensions = set(args.extensions) if args.extensions else None
        success = package_reader(args.directory, args.output, extensions)
    elif args.command == 'unpack':
        success = package_writer(args.master_file, args.output_dir, args.overwrite)

    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())