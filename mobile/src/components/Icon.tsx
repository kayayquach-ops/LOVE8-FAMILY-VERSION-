import createIconSet from '@expo/vector-icons/createIconSet';
import glyphMap from './ionicons.json';

// Ionicons đã cắt gọn: font chỉ chứa những icon app đang dùng (22KB thay vì 380KB), để bản web mở nhanh.
// Dùng icon mới thì chạy lại `python3 scripts/subset-fonts.py`; nếu quên, typecheck sẽ báo tên icon không hợp lệ.
export const Ionicons = createIconSet(glyphMap, 'ionicons-subset', require('../../assets/fonts/Ionicons-subset.ttf'));
