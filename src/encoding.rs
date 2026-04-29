//! Binary encoding helpers for deterministic recipe serialization.
//!
//! All encoders produce a fixed, canonical byte sequence for any given input.
//! There is exactly one valid encoding for each value — no configuration,
//! no ambiguity, no padding.

use std::fmt;

/// Error type for encoding/decoding operations.
#[derive(Debug)]
pub enum EncodeError {
    /// A string exceeded the maximum length for its length prefix.
    StringTooLong { max: usize, actual: usize },
    /// Unexpected end of input while decoding.
    UnexpectedEof { what: String },
    /// An invalid value was encountered.
    InvalidValue { field: String, value: String },
    /// Magic bytes did not match the expected value.
    InvalidMagic { expected: String, got: String },
    /// Format version is not supported.
    InvalidVersion { expected: u8, got: u8 },
    /// A list that should be sorted was not in ascending order.
    InvalidSortOrder { field: String, first: String, second: String },
    /// Trailing bytes remain after decoding.
    TrailingBytes { count: usize },
}

impl fmt::Display for EncodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::StringTooLong { max, actual } => {
                write!(f, "string too long: max {max} bytes, got {actual}")
            }
            Self::UnexpectedEof { what } => {
                write!(f, "unexpected end of input while reading {what}")
            }
            Self::InvalidValue { field, value } => {
                write!(f, "invalid value for {field}: {value}")
            }
            Self::InvalidMagic { expected, got } => {
                write!(f, "invalid magic: expected {expected}, got {got}")
            }
            Self::InvalidVersion { expected, got } => {
                write!(f, "invalid version: expected {expected}, got {got}")
            }
            Self::InvalidSortOrder { field, first, second } => {
                write!(f, "{field} not sorted: '{first}' >= '{second}'")
            }
            Self::TrailingBytes { count } => {
                write!(f, "{count} trailing bytes remain after decode")
            }
        }
    }
}

impl std::error::Error for EncodeError {}

pub type Result<T> = std::result::Result<T, EncodeError>;

/// A simple byte buffer for building deterministic binary encodings.
#[derive(Default)]
pub struct Encoder {
    buf: Vec<u8>,
}

impl Encoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reserve capacity for upcoming writes.
    pub fn reserve(&mut self, additional: usize) {
        self.buf.reserve(additional);
    }

    /// Write a single byte.
    pub fn u8(&mut self, v: u8) {
        self.buf.push(v);
    }

    /// Write a u16 in little-endian.
    pub fn u16_le(&mut self, v: u16) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    /// Write a u32 in little-endian.
    pub fn u32_le(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }

    /// Write a raw 32-byte hash.
    pub fn hash(&mut self, v: &[u8; 32]) {
        self.buf.extend_from_slice(v);
    }

    /// Write a length-prefixed UTF-8 string with a u16 length prefix.
    /// Panics if the string exceeds u16::MAX bytes (65535).
    pub fn str_u16(&mut self, s: &str) {
        let bytes = s.as_bytes();
        assert!(
            bytes.len() <= u16::MAX as usize,
            "string too long for u16 length prefix: {} bytes",
            bytes.len()
        );
        self.u16_le(bytes.len() as u16);
        self.buf.extend_from_slice(bytes);
    }

    /// Write a presence byte (0x00 = absent, 0x01 = present) followed by
    /// the value if present.
    pub fn optional<T>(&mut self, opt: Option<&T>, write_val: impl FnOnce(&mut Self, &T)) {
        match opt {
            Some(v) => {
                self.u8(0x01);
                write_val(self, v);
            }
            None => {
                self.u8(0x00);
            }
        }
    }

    /// Write a list with a u32 count prefix, calling `write_item` for each element.
    pub fn list_u32<T>(&mut self, items: &[T], write_item: impl Fn(&mut Self, &T)) {
        assert!(
            items.len() <= u32::MAX as usize,
            "list too long for u32 count prefix"
        );
        self.u32_le(items.len() as u32);
        for item in items {
            write_item(self, item);
        }
    }

    /// Consume the encoder and return the encoded bytes.
    pub fn into_bytes(self) -> Vec<u8> {
        self.buf
    }

    /// Get a reference to the encoded bytes so far.
    pub fn as_bytes(&self) -> &[u8] {
        &self.buf
    }

    /// Get a mutable reference to the underlying buffer.
    /// Use sparingly — direct buffer manipulation bypasses the encoding helpers.
    pub fn as_bytes_mut(&mut self) -> &mut Vec<u8> {
        &mut self.buf
    }
}

/// A cursor over a byte slice for deterministic binary decoding.
pub struct Decoder<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Decoder<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    /// How many bytes remain unread.
    pub fn remaining(&self) -> usize {
        self.data.len() - self.pos
    }

    /// Read a single byte.
    pub fn u8(&mut self) -> Result<u8> {
        if self.remaining() < 1 {
            return Err(EncodeError::UnexpectedEof {
                what: "u8".into(),
            });
        }
        let v = self.data[self.pos];
        self.pos += 1;
        Ok(v)
    }

    /// Read a u16 little-endian.
    pub fn u16_le(&mut self) -> Result<u16> {
        if self.remaining() < 2 {
            return Err(EncodeError::UnexpectedEof {
                what: "u16".into(),
            });
        }
        let v = u16::from_le_bytes([self.data[self.pos], self.data[self.pos + 1]]);
        self.pos += 2;
        Ok(v)
    }

    /// Read a u32 little-endian.
    pub fn u32_le(&mut self) -> Result<u32> {
        if self.remaining() < 4 {
            return Err(EncodeError::UnexpectedEof {
                what: "u32".into(),
            });
        }
        let v = u32::from_le_bytes([
            self.data[self.pos],
            self.data[self.pos + 1],
            self.data[self.pos + 2],
            self.data[self.pos + 3],
        ]);
        self.pos += 4;
        Ok(v)
    }

    /// Read a raw 32-byte hash.
    pub fn hash(&mut self) -> Result<[u8; 32]> {
        if self.remaining() < 32 {
            return Err(EncodeError::UnexpectedEof {
                what: "hash (32 bytes)".into(),
            });
        }
        let mut h = [0u8; 32];
        h.copy_from_slice(&self.data[self.pos..self.pos + 32]);
        self.pos += 32;
        Ok(h)
    }

    /// Read a length-prefixed UTF-8 string with a u16 length prefix.
    pub fn str_u16(&mut self) -> Result<String> {
        let len = self.u16_le()? as usize;
        if self.remaining() < len {
            return Err(EncodeError::UnexpectedEof {
                what: format!("string ({len} bytes)"),
            });
        }
        let s = std::str::from_utf8(&self.data[self.pos..self.pos + len])
            .map_err(|e| EncodeError::InvalidValue {
                field: "string".into(),
                value: e.to_string(),
            })?;
        self.pos += len;
        Ok(s.to_string())
    }

    /// Read a presence byte and, if present, decode the value.
    pub fn optional<T>(
        &mut self,
        read_val: impl FnOnce(&mut Self) -> Result<T>,
    ) -> Result<Option<T>> {
        match self.u8()? {
            0x00 => Ok(None),
            0x01 => Ok(Some(read_val(self)?)),
            v => Err(EncodeError::InvalidValue {
                field: "optional presence byte".into(),
                value: format!("expected 0x00 or 0x01, got 0x{v:02x}"),
            }),
        }
    }

    /// Read a list with a u32 count prefix, calling `read_item` for each element.
    pub fn list_u32<T>(&mut self, read_item: impl FnMut(&mut Self) -> Result<T>) -> Result<Vec<T>> {
        let count = self.u32_le()? as usize;
        let mut items = Vec::with_capacity(count.min(1024));
        let mut read_item = read_item;
        for _ in 0..count {
            items.push(read_item(self)?);
        }
        Ok(items)
    }

    /// Assert that all bytes have been consumed.
    pub fn finish(self) -> Result<()> {
        if self.remaining() > 0 {
            Err(EncodeError::TrailingBytes { count: self.remaining() })
        } else {
            Ok(())
        }
    }

    /// Read exactly `len` bytes and return a sub-slice.
    /// Advances the cursor position.
    pub fn read_bytes(&mut self, len: usize) -> Result<&'a [u8]> {
        if self.remaining() < len {
            return Err(EncodeError::UnexpectedEof {
                what: format!("byte slice ({len} bytes)"),
            });
        }
        let slice = &self.data[self.pos..self.pos + len];
        self.pos += len;
        Ok(slice)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_u8() {
        let mut enc = Encoder::new();
        enc.u8(0x42);
        let bytes = enc.into_bytes();
        let mut dec = Decoder::new(&bytes);
        assert_eq!(dec.u8().unwrap(), 0x42);
        dec.finish().unwrap();
    }

    #[test]
    fn roundtrip_u16_le() {
        let mut enc = Encoder::new();
        enc.u16_le(0x1234);
        let bytes = enc.into_bytes();
        assert_eq!(bytes, &[0x34, 0x12]); // little-endian
        let mut dec = Decoder::new(&bytes);
        assert_eq!(dec.u16_le().unwrap(), 0x1234);
    }

    #[test]
    fn roundtrip_u32_le() {
        let mut enc = Encoder::new();
        enc.u32_le(0xDEADBEEF);
        let bytes = enc.into_bytes();
        let mut dec = Decoder::new(&bytes);
        assert_eq!(dec.u32_le().unwrap(), 0xDEADBEEF);
    }

    #[test]
    fn roundtrip_str_u16() {
        let mut enc = Encoder::new();
        enc.str_u16("hello, world!");
        let bytes = enc.into_bytes();
        let mut dec = Decoder::new(&bytes);
        assert_eq!(dec.str_u16().unwrap(), "hello, world!");
        dec.finish().unwrap();
    }

    #[test]
    fn roundtrip_str_u16_empty() {
        let mut enc = Encoder::new();
        enc.str_u16("");
        let bytes = enc.into_bytes();
        assert_eq!(bytes, &[0x00, 0x00]); // zero-length prefix only
        let mut dec = Decoder::new(&bytes);
        assert_eq!(dec.str_u16().unwrap(), "");
    }

    #[test]
    fn roundtrip_hash() {
        let h = [0xABu8; 32];
        let mut enc = Encoder::new();
        enc.hash(&h);
        let bytes = enc.into_bytes();
        assert_eq!(bytes.len(), 32);
        let mut dec = Decoder::new(&bytes);
        assert_eq!(dec.hash().unwrap(), h);
    }

    #[test]
    fn roundtrip_optional_some() {
        let mut enc = Encoder::new();
        enc.optional(Some(&0x42u8), |e, &v| e.u8(v));
        let bytes = enc.into_bytes();
        assert_eq!(bytes, &[0x01, 0x42]);
        let mut dec = Decoder::new(&bytes);
        let val: Option<u8> = dec.optional(|d| d.u8()).unwrap();
        assert_eq!(val, Some(0x42));
    }

    #[test]
    fn roundtrip_optional_none() {
        let mut enc = Encoder::new();
        enc.optional::<u8>(None, |_, _| {});
        let bytes = enc.into_bytes();
        assert_eq!(bytes, &[0x00]);
        let mut dec = Decoder::new(&bytes);
        let val: Option<u8> = dec.optional(|d| d.u8()).unwrap();
        assert_eq!(val, None);
    }

    #[test]
    fn roundtrip_list_u32() {
        let items = vec![0x10u8, 0x20, 0x30];
        let mut enc = Encoder::new();
        enc.list_u32(&items, |e, &v| e.u8(v));
        let bytes = enc.into_bytes();
        let mut dec = Decoder::new(&bytes);
        let decoded: Vec<u8> = dec.list_u32(|d| d.u8()).unwrap();
        assert_eq!(decoded, items);
    }

    #[test]
    fn roundtrip_list_u32_empty() {
        let items: Vec<u8> = vec![];
        let mut enc = Encoder::new();
        enc.list_u32(&items, |_, _| {});
        let bytes = enc.into_bytes();
        assert_eq!(bytes, &[0x00, 0x00, 0x00, 0x00]); // u32 count = 0
        let mut dec = Decoder::new(&bytes);
        let decoded: Vec<u8> = dec.list_u32(|d| d.u8()).unwrap();
        assert!(decoded.is_empty());
    }

    #[test]
    fn decoder_eof_on_u8() {
        let mut dec = Decoder::new(&[]);
        assert!(dec.u8().is_err());
    }

    #[test]
    fn decoder_eof_on_str() {
        // Length prefix says 5 bytes, but only 2 available
        let data: &[u8] = &[0x05, 0x00, 0x41, 0x42];
        let mut dec = Decoder::new(data);
        assert!(dec.str_u16().is_err());
    }

    #[test]
    fn decoder_trailing_bytes() {
        let mut dec = Decoder::new(&[0x42, 0xFF]);
        assert_eq!(dec.u8().unwrap(), 0x42);
        let err = dec.finish().unwrap_err();
        match err {
            EncodeError::TrailingBytes { count } => assert_eq!(count, 1),
            other => panic!("expected TrailingBytes, got {other:?}"),
        }
    }

    #[test]
    fn decoder_invalid_optional_presence() {
        let mut dec = Decoder::new(&[0x02]);
        let result: Result<Option<u8>> = dec.optional(|d| d.u8());
        assert!(result.is_err());
    }
}
