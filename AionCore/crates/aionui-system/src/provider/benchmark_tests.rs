use super::*;

#[test]
fn endpoint_preserves_versions_and_explicit_urls() {
    assert_eq!(
        endpoint("https://example.com/v1/", "v1/messages", false).unwrap(),
        "https://example.com/v1/messages"
    );
    assert_eq!(
        endpoint("https://example.com/api/v1", "chat/completions", false).unwrap(),
        "https://example.com/api/v1/chat/completions"
    );
    assert_eq!(
        endpoint("https://example.com/custom?x=1", "responses", true).unwrap(),
        "https://example.com/custom?x=1"
    );
}

#[test]
fn rejects_non_http_and_embedded_credentials() {
    for url in ["file:///tmp/a", "https://user:secret@example.com", "invalid"] {
        assert!(matches!(
            endpoint(url, "messages", false),
            Err(SystemError::BadRequest(_))
        ));
    }
}
