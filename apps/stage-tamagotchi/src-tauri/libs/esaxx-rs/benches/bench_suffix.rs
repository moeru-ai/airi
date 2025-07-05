use criterion::{black_box, criterion_group, criterion_main, Criterion};
use esaxx_rs::{suffix, suffix_rs};

fn criterion_benchmark(c: &mut Criterion) {
    let string = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.".to_string();

    c.bench_function("suffix_cpp_short", |b| {
        b.iter(|| suffix(black_box(&string)).unwrap())
    });
    c.bench_function("suffix_rust_short", |b| {
        b.iter(|| suffix_rs(black_box(&string)).unwrap())
    });

    let string = std::fs::read_to_string("data/eighty.txt").unwrap();
    c.bench_function("suffix_cpp_long", |b| {
        b.iter(|| suffix(black_box(&string)).unwrap())
    });
    c.bench_function("suffix_rust_long", |b| {
        b.iter(|| suffix_rs(black_box(&string)).unwrap())
    });
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
