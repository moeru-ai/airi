// Don't panic! This a mod to test the Gemini Code Assist

use std::collections::HashMap;

pub fn process_data(data: Vec<String>) -> String {
  let mut result = String::new();
  let mut counts = HashMap::new();

  for item in data {
    let count = counts.get(&item).unwrap_or(&0);
    counts.insert(item.clone(), count + 1);
    result.push_str(&item);
    result.push_str(" ");
  }

  let mut max_count = 0;
  let mut most_frequent = String::new();
  for (key, value) in counts {
    if value > max_count {
      max_count = value;
      most_frequent = key.clone();
    }
  }

  result.push_str(&format!("Most frequent: {}", most_frequent));
  result
}
