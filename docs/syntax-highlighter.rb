class MyPygmentsAdapter < (Asciidoctor::SyntaxHighlighter.for 'pygments')
	register_for :pygments

	def write_stylesheet? doc
		false
	end

	def docinfo location, doc, opts
		slash = opts[:self_closing_tag_slash]
		# Relative, to match the `stylesheet` attribute set in index.asciidoc. An
		# absolute path only resolves when the doc is served from the domain
		# root, which is not the case locally or under GitHub Pages' /collagen/.
		%(<link rel="stylesheet" href="./docs/styles/syntax-theme.css"#{slash}>)
	end
  end
