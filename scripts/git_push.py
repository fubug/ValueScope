#!/usr/bin/env python3
"""Git commit & push wrapper for ValueScope data files."""
import subprocess, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")

# add & commit (already committed locally, just need push)
result = subprocess.run(
    ["git", "push", "origin", "main"],
    capture_output=True, text=True, timeout=30
)
if result.returncode == 0:
    print("Git push 成功")
else:
    print(f"Git push 失败: {result.stderr.strip()}")
    sys.exit(1)
