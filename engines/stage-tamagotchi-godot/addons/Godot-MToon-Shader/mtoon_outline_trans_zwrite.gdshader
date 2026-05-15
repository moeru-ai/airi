shader_type spatial;
render_mode depth_draw_always;
render_mode cull_front;

#define IS_OUTLINE
#define ALPHA_BLEND

#include "./mtoon_common.gdshaderinc"