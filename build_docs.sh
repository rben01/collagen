#!/usr/bin/env sh
sed 's^:docs/^:^g' <readme.adoc | asciidoctor --backend docbook --out-file - - | pandoc --from docbook --to markdown_strict --output docs/readme-docsrs.md
