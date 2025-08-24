#!/usr/bin/env sh
sed 's^:docs/^https://rben01.github.io/collagen/docs/^g' <readme.adoc | asciidoctor --backend html5 --out-file - - | pandoc --from html --to gfm --output docs/readme-docsrs.md
