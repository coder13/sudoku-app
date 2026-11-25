use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error as _};

use crate::{Board, CELLS, parse_givens};

pub(super) const fn empty_grid() -> Board {
    [0; CELLS]
}

pub(super) const fn empty_masks() -> [u16; CELLS] {
    [0; CELLS]
}

pub(super) mod shades {
    use super::*;

    pub fn serialize<S: Serializer>(shades: &Board, serializer: S) -> Result<S::Ok, S::Error> {
        if shades.iter().any(|&shade| shade > 2) {
            return Err(serde::ser::Error::custom(
                "shades must be 0 (unknown), 1 (unshaded), or 2 (shaded)",
            ));
        }
        let text: String = shades
            .iter()
            .map(|&shade| char::from(b'0' + shade))
            .collect();
        serializer.serialize_str(&text)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Board, D::Error> {
        let text = String::deserialize(deserializer)?;
        if text.len() != CELLS || !text.bytes().all(|byte| (b'0'..=b'2').contains(&byte)) {
            return Err(D::Error::custom(
                "expected 81 shade values from 0 through 2",
            ));
        }
        Ok(std::array::from_fn(|cell| text.as_bytes()[cell] - b'0'))
    }
}

pub(super) mod grid {
    use super::*;

    pub fn serialize<S: Serializer>(board: &Board, serializer: S) -> Result<S::Ok, S::Error> {
        if board.iter().any(|&digit| digit > 9) {
            return Err(serde::ser::Error::custom(
                "grid digits must be between 0 and 9",
            ));
        }
        let text: String = board
            .iter()
            .map(|&digit| char::from(b'0' + digit))
            .collect();
        serializer.serialize_str(&text)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Board, D::Error> {
        let text = String::deserialize(deserializer)?;
        parse_givens(&text).ok_or_else(|| D::Error::custom("expected a grid with 81 ASCII cells"))
    }
}

pub(super) mod masks {
    use super::*;

    pub fn serialize<S: Serializer>(
        masks: &[u16; CELLS],
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        masks.as_slice().serialize(serializer)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<[u16; CELLS], D::Error> {
        Vec::<u16>::deserialize(deserializer)?
            .try_into()
            .map_err(|_| D::Error::custom("expected 81 candidate masks"))
    }
}
