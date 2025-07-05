use esaxx_rs::{suffix, suffix_rs};
use std::env::args;
use std::fs;

fn main() {
    // Prints each argument on a separate line
    let args: Vec<_> = args().skip(1).collect();
    let version = &args[0];
    let filename = &args[1];

    let string = fs::read_to_string(filename).unwrap();
    let (count, version) = if version == "rust" {
        (suffix_rs(&string).unwrap().iter().count(), "Rust")
    } else {
        (suffix(&string).unwrap().iter().count(), "Cpp")
    };
    println!("Used {} version ! Found {} nodes", version, count);
}
