//! This file contains `struct DecodingContext`, a type whose instances hold everything
//! needed to decode an object. This is needed because (AFAICT) `serde` lacks the
//! ability to inject external state into the deserialization process. As a result,
//! objects are deserialied into a state which does not contain all information needed
//! for decoding; supplying the context in which they are being decoded allows one to
//! complete the decoding.
//!
//! Example: paths are specified relative to some "root path" which is determined at
//! runtime and is not (de)serialized. So in order for the full path to be obtained from
//! a deserialized `path`, the root path must also be supplied; only then can decoding
//! proceed.

pub(crate) mod errors;
pub(super) mod functions;
pub(crate) mod parser;
