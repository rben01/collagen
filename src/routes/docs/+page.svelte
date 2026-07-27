<script lang="ts">
	import { asset, resolve } from "$app/paths";
	import CodeBlock from "$lib/components/CodeBlock.svelte";

	const example01 = `local bubble_text = 'Collagen!!';  // (1)
local nose_color = '#f00';
local text_color = '#000';

{
  attrs: { viewBox: '0 0 500 400' },
  children: [
    {
      image_path: 'images/smiley.jpg',  // (2)
      attrs: { transform: 'translate(0 100) scale(1.3)' },
    },
    {
      tag: 'circle',  // (3)
      attrs: {
        cx: 123,
        cy: 240,
        r: 15,
        fill: nose_color,
        stroke: '#000',
        'stroke-width': 3,
      },
    },
    {
      tag: 'path',
      attrs: {
        d: 'M 230 140 L 265 120 A 100 40 0 1 0 235 110 Z',
        stroke: '#000',
        'stroke-width': 3,
        fill: '#fff',
      },
    },
    {
      tag: 'text',
      attrs: {
        x: 250,
        y: 97,
        'text-anchor': 'start',
        'dominant-baseline': 'top',
        'font-family': 'Impact',
        'font-size': 30,
        fill: text_color,
      },
      children: [bubble_text],  // (4)
    },
  ],
}`;

	const example02 = `{
  attrs: { viewBox: '0 0 300 250' },
  children: [
    {
      tag: 'rect',
      attrs: {
        x: '10',
        y: '10',
        width: '275',
        height: '225',
        fill: '#ddd',
        stroke: '#00f',
        'stroke-width': '10',
        'stroke-dasharray': '10 10',
      },
    },
    {
      tag: 'g',
      attrs: { transform: 'translate(50 25) scale(.5)' },
      children: [
        {
          clgn_path: './smiley/skeleton',
        },
      ],
    },
    {
      image_path: './kitty.jpg',
      attrs: { transform: 'translate(180 150) scale(.15)' },
    },
  ],
}`;

	const example03 = `{
  attrs: {
    viewBox: "0 0 800 650",
  },
  children: [
    {
      fonts: [
        {
          name: "Impact",
          path: "./impact.woff2",  // (1)
        },
      ],
    },
    {
      image_path: "./drake-small.jpg",
      attrs: {
        width: 800,
      },
    },
    {
      local x = 550,
      local dy = 50,
      tag: "text",
      attrs: {
        "font-family": "Impact",
        "font-size": 50,
        color: "black",
        "text-anchor": "middle",
        "vertical-align": "top",
        x: x,
        y: 420,
      },
      children: [
        {
          tag: "tspan",
          attrs: {
            x: x,
            dy: if i == 0 then 0 else dy,  // (3)
          },
          children: [
            "Using SVG-based text,",
            "which is infinitely",
            "zoomable and has",
            "no artifacts",
          ][i],  // (4)
        }
        for i in std.range(0, 3)  // (2)
      ],
    },
  ],
}`;
</script>

<svelte:head>
	<title>Up and Running With Collagen</title>
	<meta
		name="description"
		content="A tutorial for writing Collagen manifests: embedding images, nesting skeletons, and using Jsonnet to generate SVG."
	/>
</svelte:head>

<div class="docs-page">
	<article class="docs">
		<header class="docs-header">
			<!-- resolve() takes a params object even for routes with no params -->
			<a class="back-link" href={resolve("/", {})}
				>&larr; Back to the editor</a
			>
			<h1>Up and Running With Collagen</h1>
		</header>

		<nav class="toc" aria-label="Contents">
			<h2>Contents</h2>
			<ol>
				<li><a href="#introduction">Introduction</a></li>
				<li><a href="#using-collagen">Using Collagen</a></li>
				<li><a href="#basic-example">A Basic Example</a></li>
				<li>
					<a href="#complicated-example">A More Complicated Example</a>
				</li>
				<li><a href="#memes">Memes</a></li>
			</ol>
		</nav>

		<section id="introduction">
			<h2>Introduction</h2>
			<p>
				Collagen is a program that takes as input a folder containing zero
				or more image files (<code>.jpeg</code>, <code>.png</code>, etc.)
				and a JSON or
				<a href="https://jsonnet.org" target="_blank" rel="noreferrer"
					>Jsonnet</a
				>
				manifest file describing the layout of these images along with SVG components
				such as shapes and text, and produces as output a single SVG file with
				all assets embedded.
			</p>
			<p>
				This allows a user to combine several graphics into a single file
				that can be displayed as an image without compromising on visual
				quality or file size.<a
					class="footnote-ref"
					href="#fn-1"
					id="fn-ref-1"
					aria-describedby="footnotes">[1]</a
				>
			</p>
		</section>

		<section id="using-collagen">
			<h2>Using Collagen</h2>
			<p>
				The input to Collagen is a folder containing at the very least a
				<code>collagen.json</code>
				or <code>collagen.jsonnet</code> manifest file describing the layout
				of the resulting SVG. If the manifest specifies any image files (by
				their path relative to the folder), then those image files must also
				be present at the expected path in the folder. An input folder
				satisfying these criteria will be referred to as a
				<em>skeleton</em>.
			</p>
			<p>
				If <code>collagen.jsonnet</code> is provided, it is first expanded
				into JSON, then evaluated as if it were a <code>collagen.json</code>
				file. While <code>collagen.json</code> is supported, even the least bit
				of complexity will quickly become overwhelming, in which case you should
				switch from JSON to Jsonnet. Jsonnet was designed to look like JSON (and,
				when evaluated, produces JSON) while supporting common programmatic features
				such as variables, functions, string interpolation, and array concatenation
				and object merging. These features make building the desired SVG a breeze.
			</p>
		</section>

		<section id="basic-example">
			<h2>A Basic Example</h2>
			<p>
				An example of a simple input-output pair is below. Suppose you have
				the following simple skeleton at directory <code>example-01</code>:
			</p>

			<pre class="tree">example-01
├── collagen.jsonnet
└── images
    └── smiley.jpg</pre>

			<p>
				Where <code>images/smiley.jpg</code> is the following image (whose native
				size is 380×380 pixels):
			</p>

			<figure>
				<img
					src={asset("/tutorial/smiley.jpg")}
					alt="A yellow smiley face"
					width="200"
				/>
			</figure>

			<p>And where <code>collagen.jsonnet</code> contains the following:</p>

			<CodeBlock
				code={example01}
				filename="example-01/collagen.jsonnet"
				callouts={[
					{
						marker: 1,
						text: "Some variable declarations we'll make use of later.",
					},
					{
						marker: 2,
						text: "To include an image, just give its relative path.",
					},
					{
						marker: 3,
						text: "Most other tags are specified with the `tag` field, which contains the name of the SVG tag to use.",
					},
					{
						marker: 4,
						text: "A string like 'Collagen!!' gets turned into a text node: in SVG, <text>Collagen!!</text>.",
					},
				]}
			/>

			<p>Then, running the following command:</p>

			<CodeBlock
				code="clgn -i example-01 -o example-01.svg"
				language="bash"
			/>

			<p>
				Will produce the following file, <code>example-01.svg</code>:
			</p>

			<figure>
				<img
					src={asset("/tutorial/example-01.svg")}
					alt="A smiley face with a red nose and a speech bubble reading “Collagen!!”"
					width="500"
				/>
			</figure>

			<p>
				If you zoom in, you'll see the smiley face's pixels — this is
				unavoidable, as the original smiley was just a jpeg. But because the
				nose and speech bubble are SVG elements (i.e. vector graphics, not
				raster) they look nice and smooth and crisp even when zoomed in.
				That's the whole point! Perfectly precise vector graphics can
				coexist alongside raster graphics.
			</p>
		</section>

		<section id="complicated-example">
			<h2>A More Complicated Example</h2>
			<p>
				As we've seen, we can include raster images in skeletons; it would
				be silly if we couldn't also include other skeletons. Nested
				skeletons can be included by adding a child of the form
				<code>&#123;"clgn_path": &lt;path&gt;&#125;</code>. (Whereas a
				standalone skeleton gets turned into a <code>&lt;svg&gt;</code> tag,
				a nested skeleton will reside in a <code>&lt;g&gt;</code> tag.) Let's
				include the above skeleton in another (and just for fun, let's add a
				photo of a kitten too, because why not):
			</p>

			<pre class="tree">example-02
├── collagen.jsonnet
├── example-01
│   ├── collagen.jsonnet
│   └── images
│       └── smiley.jpg
└── kitty.jpg</pre>

			<p>Where <code>example-02/collagen.jsonnet</code> is below:</p>

			<CodeBlock code={example02} filename="example-02/collagen.jsonnet" />

			<p>
				Here's the result when you run
				<code>clgn -i example-02 -o example-02.svg</code>:
			</p>

			<figure>
				<img
					src={asset("/tutorial/example-02.svg")}
					alt="A dashed blue box containing the smiley face collage and a grey kitten"
					width="600"
				/>
			</figure>

			<p>
				So, as far as Collagen is concerned, skeletons act more or less the
				same as raster images, in the sense that the path is sufficient to
				include them. The only difference is that the path to a skeleton
				child is given by the key <code>clgn_path</code> instead of
				<code>image_path</code>.
			</p>
		</section>

		<section id="memes">
			<h2>Memes</h2>
			<p>
				A format that makes it easy to place text on images? Sounds like it
				would be perfect for memes. But it's not a meme unless it uses the
				“Impact” font.
			</p>

			<CodeBlock
				code={example03}
				filename="example-03/collagen.jsonnet"
				callouts={[
					{
						marker: 1,
						text: "We can include a path to the font file to embed it directly in the SVG.",
					},
					{ marker: 2, text: "We can use list comprehensions…" },
					{
						marker: 3,
						text: "And use the variable in conditional statements…",
					},
					{ marker: 4, text: "And as a list index (0-indexed)." },
				]}
			/>

			<figure>
				<img
					src={asset("/tutorial/example-03.svg")}
					alt="A Drake meme. Top panel, with pixelated text: Embedding text directly into a raster file. Bottom panel, with perfectly sharp text: Using SVG-based text, which is infinitely zoomable and has no artifacts"
					width="500"
				/>
			</figure>
		</section>

		<footer class="footnotes" id="footnotes">
			<hr />
			<ol>
				<li id="fn-1">
					Technically base64 encoding data does increase its size by about
					a third. However, you don't need to pay this cost when
					transmitting the file; you can transmit the raw components and
					then use Collagen to encode them into an SVG on the receiving
					end. In other words, Collagen is akin to compression such as
					gunzip: it allows a smaller payload to be transmitted as long as
					the receiving end can turn it back into something useful.
					<a href="#fn-ref-1" aria-label="Back to content">&crarr;</a>
				</li>
			</ol>
		</footer>
	</article>
</div>

<style>
	/* The app has no page background of its own; its panes are white cards on
	   whatever the user agent provides (dark, under a dark colour scheme). Give
	   the docs the same treatment so the text keeps its contrast either way. */
	.docs-page {
		box-sizing: border-box;
		min-height: 100vh;
		padding: 1rem;
	}

	.docs {
		display: block;
		max-width: 52rem;
		margin: 0 auto;
		padding: 2.5rem 3rem 4rem;
		background: #fff;
		border-radius: 0.5rem;
		color: #3c4047;
		line-height: 1.6;
	}

	.docs-header {
		margin-bottom: 2rem;
	}

	.back-link {
		display: inline-block;
		margin-bottom: 1rem;
		font-size: 0.95rem;
	}

	h1 {
		margin: 0;
		color: #2563eb;
		font-weight: 700;
		font-size: 2.5rem;
		line-height: 1.15;
	}

	h2 {
		margin: 2.5rem 0 0.75rem;
		font-size: 1.6rem;
		color: #111827;
		border-bottom: 1px solid #e5e7eb;
		padding-bottom: 0.3rem;
	}

	.toc {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 1rem 1.25rem;
	}

	.toc h2 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
		border: none;
		padding: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #6b7280;
	}

	.toc ol {
		margin: 0;
		padding-left: 1.25rem;
	}

	p {
		margin: 0 0 1rem;
	}

	code {
		background: #f3f4f6;
		color: #111827;
		padding: 0.1em 0.3em;
		border-radius: 0.25em;
		font-size: 85%;
	}

	pre.tree {
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		padding: 1rem;
		overflow-x: auto;
		font-family: var(--mono-font-family);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	figure {
		margin: 1.5rem 0;
		text-align: center;
	}

	figure img {
		max-width: 100%;
		height: auto;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
		background: #fff;
	}

	.footnotes {
		margin-top: 3rem;
		font-size: 0.9rem;
		color: #6b7280;
	}

	.footnotes hr {
		border: none;
		border-top: 1px solid #e5e7eb;
		margin-bottom: 1rem;
	}

	.footnote-ref {
		font-size: 0.75em;
		vertical-align: super;
		text-decoration: none;
	}

	@media (max-width: 640px) {
		h1 {
			font-size: 2rem;
		}
		.docs {
			padding: 1.5rem 1rem 3rem;
		}
	}
</style>
