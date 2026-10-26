# Nimble for Alfred

A Script Filter over the public API. One question in, one sentence out; Enter copies it.

1. In Alfred, make a workflow with a Script Filter (language: `/usr/bin/python3`, with input as argv).
2. Paste: `python3 /path/to/nimble.py "$1"`. Set a keyword such as `ask`, and "Argument Required".
3. Connect a Copy to Clipboard output.

Test from the shell: `python3 nimble.py capital of france`.
