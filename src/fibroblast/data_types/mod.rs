//! Contains the data types used for the in-memory representation of a `Fibroblast`.

pub(crate) mod context;
pub use context::DecodingContext;

mod concrete_number;
pub(crate) use concrete_number::ConcreteNumber;

mod simple_value;
pub(crate) use simple_value::SimpleValue;

mod variable_value;
pub(crate) use variable_value::VariableValue;
