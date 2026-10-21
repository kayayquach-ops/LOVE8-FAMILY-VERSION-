import { StyleSheet, View } from 'react-native';
import { BackHeader, Card, Screen, SectionHeader, T } from '@/components/ui';
import { colors } from '@/theme';

const RULES: Array<[string, string]> = [
  ['Người kể là chủ câu chuyện', 'Bố mẹ xem lại trước khi chia sẻ, và xoá bất cứ lúc nào.'],
  ['Tâm sự riêng là riêng', 'Thư chỉ chuyển lời khi bạn bấm đồng ý, và bạn chọn chuyển cho ai.'],
  ['Không theo dõi vị trí', 'Widget chỉ cho biết ai đã gửi ảnh hôm nay, không có bản đồ.'],
  ['Không bán dữ liệu, không quảng cáo', 'Thu nhập đến từ Gói Gia đình và sách in.'],
  ['Giữ nguyên lời kể gốc', 'AI chỉ sửa chính tả. Luôn có đoạn ghi âm gốc để kiểm chứng.'],
  ['Khuôn mặt xử lý trên máy', 'Nhận diện người trong ảnh (sắp có) chạy ngay trên điện thoại, không gửi lên máy chủ.'],
];

// Tóm tắt cam kết quyền riêng tư. Văn bản pháp lý chính thức cần luật sư soạn theo
// Luật Bảo vệ dữ liệu cá nhân của Việt Nam (hiệu lực 1/1/2026) và PIPA của Hàn Quốc.
export default function Privacy() {
  return (
    <Screen>
      <BackHeader title="Quyền riêng tư" />
      <T variant="display" style={{ marginTop: 4 }}>Những điều Homeletter cam kết với gia đình bạn</T>
      <View style={{ gap: 10, marginTop: 16 }}>
        {RULES.map(([t, d]) => (
          <Card key={t} style={styles.card}>
            <T variant="body" weight="semibold">{t}</T>
            <T variant="small" color={colors.inkSoft}>{d}</T>
          </Card>
        ))}
      </View>
      <SectionHeader title="Dữ liệu của bạn" />
      <T variant="body" color={colors.inkSoft}>
        Bạn có thể tải toàn bộ ảnh, ghi âm và sổ ký ức về máy, hoặc xoá tài khoản cùng mọi dữ liệu trong Cài đặt.
      </T>
      <SectionHeader title="Ghi công" />
      <T variant="small" color={colors.muted}>
        Avatar của gia đình mẫu: Avataaars của Pablo Stanley, dùng tự do cho cả mục đích thương mại. Giao diện lấy cảm hứng từ bản thiết kế MAD (Social Dares) của Nixtio. Chữ: Be Vietnam Pro (SIL Open Font License). Icon: Ionicons (MIT).
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { gap: 4 } });
