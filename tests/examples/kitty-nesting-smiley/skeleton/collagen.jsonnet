{
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
}
