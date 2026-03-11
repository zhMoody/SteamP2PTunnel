/*
 * @Author: moody
 * @Date: 2026-03-10 16:07:46
 * @LastEditTime: 2026-03-11 18:28:40
 * @FilePath: \src-tauri\tests\protocol_tests.rs
 */
use mcct_lib::net_manager::{TunnelPacket, HEADER_SIZE};

#[test]
fn test_tunnel_packet_to_bytes_simple() {
    let packet = TunnelPacket {
        client_id: "abc123".to_string(),
        msg_type: 0,
        payload: vec![1, 2, 3, 4, 5],
    };

    let bytes = packet.to_bytes();
    assert_eq!(bytes.len(), HEADER_SIZE + 5);
    assert_eq!(&bytes[0..6], b"abc123");
    assert_eq!(bytes[6], 0);
    assert_eq!(
        u32::from_le_bytes([bytes[7], bytes[8], bytes[9], bytes[10]]),
        0
    );
    assert_eq!(&bytes[11..], &[1, 2, 3, 4, 5]);
}

#[test]
fn test_tunnel_packet_to_bytes_with_long_id() {
    let packet = TunnelPacket {
        client_id: "verylongid123456".to_string(),
        msg_type: 0,
        payload: vec![],
    };
    let bytes = packet.to_bytes();
    assert_eq!(&bytes[0..7], b"verylon");
}

#[test]
fn test_tunnel_packet_from_bytes_simple() {
    let mut bytes = vec![0u8; HEADER_SIZE + 5];
    bytes[0..6].copy_from_slice(b"test12");
    bytes[6] = 0;
    bytes[7..11].copy_from_slice(&0u32.to_le_bytes());
    bytes[11..].copy_from_slice(&[1, 2, 3, 4, 5]);

    let packet = TunnelPacket::from_bytes(&bytes).unwrap();
    assert_eq!(packet.client_id, "test12");
    assert_eq!(packet.msg_type, 0);
    assert_eq!(packet.payload, vec![1, 2, 3, 4, 5]);
}

#[test]
fn test_tunnel_packet_roundtrip() {
    let original = TunnelPacket {
        client_id: "myid12".to_string(),
        msg_type: 0,
        payload: vec![42, 43, 44, 45, 46],
    };
    let bytes = original.to_bytes();
    let recovered = TunnelPacket::from_bytes(&bytes).unwrap();
    assert_eq!(recovered.client_id, original.client_id);
    assert_eq!(recovered.msg_type, original.msg_type);
    assert_eq!(recovered.payload, original.payload);
}
