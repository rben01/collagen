local width = 200;
local height = width;
local n_spokes = 8;
local cx = width / 2;
local cy = height / 2;
local spoke_length = width * 0.6;
local pi = std.acos(-1);

{
  attrs: {
    viewBox: "0 0 %d %d" % [width, height],
  },
  children: [
    {
      local t = i / n_spokes,
      local theta = t * pi,
      local dx = (spoke_length / 2) * std.cos(theta),
      local dy = (spoke_length / 2) * std.sin(theta),

      tag: "line",
      attrs: {
        x1: cx + dx,
        x2: cx - dx,
        y1: cy + dy,
        y2: cy - dy,
        stroke: "hsl(" + std.toString(360 * t) + ", 100%, 50%)",
        "stroke-width": 3,
        "stroke-linecap": "round",
      },
    }
    for i in std.range(0, n_spokes - 1)
  ],
}