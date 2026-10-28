"""Prints the Obsidian community scorecard of a plugin as plain text.

Usage: curl -sL https://community.obsidian.md/plugins/claudian-minimal | python3 -I scorecard.py

The page is a Next.js app; the scorecard tab isn't in the HTML, only in the
React payload pushed through self.__next_f. This pulls the readable strings
out of that payload, from the scorecard section to the related plugins.
"""

import re
import sys

page = sys.stdin.read()

page = page.replace('\\"', '"').replace("\\n", "\n")
start = page.find('"id":"scorecard","className"')
if start < 0:
    sys.exit("No scorecard found. The page layout may have changed.")
# The findings sit in later chunks of the payload, so read on until the
# "Related plugins" list that follows the scorecard.
stop = page.find("Related plugins", start)
section = page[start:stop if stop > 0 else None]

seen = []
for m in re.finditer(r'"children":"((?:[^"\\]|\\.){3,})"|"href":"(https://github\.com/[^"]+)"', section):
    text = m.group(1) or m.group(2)
    if text not in seen and not text.startswith(("$", "lucide")):
        seen.append(text)

print("\n".join(seen))
