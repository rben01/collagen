{
  attrs: {
    viewBox: "0 0 800 650",
  },
  children: [
    {
      fonts: [
        {
          name: "Impact",
          path: "./impact.woff2",
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
            dy: if i == 0 then 0 else dy,
          },
          children: ["Using SVG-based text,", "which is infinitely", "zoomable and has", "no artifacts"][i],
        }
        for i in std.range(0, 3)
      ],
    },
  ],
}
