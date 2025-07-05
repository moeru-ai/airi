pub type Bucket = [usize];
/// We need to use u32  instead of char, because when we recurse
/// we use  suffix array elements as ways to replace our original
/// string. Using chars can fail. Look for ra variable.
pub type StringT = [u32];
pub type SArray = [usize];

#[derive(Debug)]
pub enum SuffixError {
    InvalidLength,
    Internal,
    IntConversion(std::num::TryFromIntError),
}

impl From<std::num::TryFromIntError> for SuffixError {
    fn from(err: std::num::TryFromIntError) -> Self {
        Self::IntConversion(err)
    }
}
