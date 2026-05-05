use std::env;
fn main() {
    let path = env::args().nth(1).expect("usage: hash-file <path>");
    let data = std::fs::read(&path).unwrap_or_else(|e| {
        eprintln!("error reading {}: {}", path, e);
        std::process::exit(1);
    });
    let hash = blake3::hash(&data);
    println!("{}", hash.to_hex());
}
