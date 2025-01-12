local vars = import './shared/shared.libjsonnet';
local x = vars.x;
local text = '<><';

{
  attrs: { viewBox: '0 0 1000 1000' },
  children: [
    {
      local x = 200,

      tag: 'rect',
      attrs: {
        x: x,
        y: 100,
        width: 400,
        height: 150,
        fill: '#92f',
      },
    },
    {
      tag: 'text',
      attrs: {
        x: 700,
        y: 200,
        'text-anchor': 'middle',
        'font-family': 'Impact',
        'font-size': 70,
        fill: 'white',
        stroke: 'black',
        'stroke-width': 2,
        weight: 700,
      },
      children: [{ text: 'Top %s %d' % [text, x] }],
    },
    {
      tag: 'rect',
      attrs: {
        x: x,
        y: 500,
        width: 400,
        height: 150,
        fill: '#9f5',
      },
    },
    {
      tag: 'text',
      attrs: {
        x: 700,
        y: 600,
        'text-anchor': 'middle',
        'font-family': 'Impact',
        'font-size': 70,
        fill: 'white',
        stroke: 'black',
        'stroke-width': 2,
        weight: 700,
      },
      children: [{ text: 'Bottom text' }],
    },
    {
      image_path: './assets/apple-touch-icon.png',
    },
    {
      clgn_path: './assets/child_image/',
    },
  ],
}
