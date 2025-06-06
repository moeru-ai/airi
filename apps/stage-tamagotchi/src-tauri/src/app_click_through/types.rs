use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Point {
  pub x: f64,
  pub y: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Size {
  pub width:  f64,
  pub height: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct WindowFrame {
  pub origin: Point,
  pub size:   Size,
}
