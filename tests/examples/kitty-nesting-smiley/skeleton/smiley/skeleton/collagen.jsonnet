local bubble_text = 'Collagen!!';
local nose_color = '#f00';
local text_color = '#000';

{
  attrs: { viewBox: '0 0 500 400' },
  children: [
    {
      image_path: 'images/smiley.jpg',
      attrs: { transform: 'translate(0 100) scale(1.3)' },
    },
    {
      tag: 'circle',
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
      children: [bubble_text],
    },
  ],
}
