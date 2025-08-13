//! WASM bindings for Collagen
//!
//! This is a wrapper crate that exposes the Collagen WASM functionality
//! for use in the Svelte frontend.

// Use `wee_alloc` as the global allocator.
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

pub use collagen::wasm::*;
