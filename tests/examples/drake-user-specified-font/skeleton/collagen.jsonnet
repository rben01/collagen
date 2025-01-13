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
            dy: 0,
          },
          children: [
            {
              text: "Using SVG-based text,",
            },
          ],
        },
        {
          tag: "tspan",
          attrs: {
            x: x,
            dy: dy,
          },
          children: [
            {
              text: "which is infinitely",
            },
          ],
        },
        {
          tag: "tspan",
          attrs: {
            x: x,
            dy: dy,
          },
          children: [
            {
              text: "zoomable and has",
            },
          ],
        },
        {
          tag: "tspan",
          attrs: {
            x: x,
            dy: dy,
          },
          children: [
            {
              text: "no artifacts",
            },
          ],
        },
      ],
    },
  ],
}
