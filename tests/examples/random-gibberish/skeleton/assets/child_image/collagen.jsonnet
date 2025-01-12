local vars = import '../../shared/shared.libjsonnet';
local y = 'this_is_y';

{
  attrs: { x: 200 },
  children: [
    {
      image_path: './Photobooth-icon.png',
    },
    {
      tag: 'text',
      attrs: {
        x: 100,
        y: 300,
        'font-size': 60,
        'font-weight': 700,
        fill: '#66ccff',
        stroke: 'black',
        'stroke-width': 3,
      },
      children: [{ text: 'nested!! x=%(x)d y=%(y)s' % { x: vars.x, y: y } }],
    },
  ],
}
