local width = 800;

{
  attrs: { viewBox: "0 0 %d 650" % width },
  children: [
    {
      tag: "defs",
      children: [
        {
          tag: "style",
          children: [
            {
              text: '@import url("https://my-fonts.pages.dev/Impact/impact.css");',
            },
          ],
        },
      ],
    },
    {
      image_path: "./drake-small.jpg",
      attrs: {
        width: width,
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
        x: "%d" % x,
        y: 420,
      },
      children: [
        {
          tag: "tspan",
          attrs: { x: x, dy: if i == 0 then 0 else dy },
          children: [{ text: [
            "Using SVG-based text,",
            "which is infinitely",
          ][i] }],
        }
        for i in std.range(0, 1)
      ] + [
        {
          tag: "tspan",
          attrs: { x: x, dy: dy },
          children: [[
            "zoomable and has",
            "no artifacts",
          ][i]],
        }
        for i in std.range(0, 1)
      ],
    },
  ],
}
