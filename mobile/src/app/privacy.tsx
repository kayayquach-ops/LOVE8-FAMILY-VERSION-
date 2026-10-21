import { StyleSheet, View } from 'react-native';
import { BackHeader, Card, Screen, SectionHeader, T } from '@/components/ui';
import { colors } from '@/theme';

const RULES: Array<[string, string]> = [
  ['Homeletter luôn nói rõ mình là AI', 'Không giả giọng người nhà. Đầu cuộc gọi chỉ phát vài giây giọng thật người nhà đã ghi sẵn.'],
  ['Người kể là chủ câu chuyện', 'Không gì được gửi đi khi người kể chưa đồng ý: bố mẹ nói "ừ" trong cuộc gọi, con duyệt trên app. Xoá được bất cứ lúc nào.'],
  ['Câu hỏi giấu tên, nhưng có giới hạn', 'Người được hỏi không biết ai hỏi. Với người dưới 18 tuổi, Homeletter không nhận câu hỏi giấu kín.'],
  ['Hồ sơ chỉ cho người khác thế hệ', 'Con xem điều đã hiểu về bố mẹ, bố mẹ xem về con. Vợ chồng, anh chị em không xem của nhau.'],
  ['Video chỉ ghép từ đồ thật', 'Ảnh thật, giọng thật, phụ đề chép đúng lời. Không tạo câu nói mới bằng giọng của ai.'],
  ['Không theo dõi vị trí', 'Widget chỉ cho biết ai đã gửi ảnh hôm nay, không có bản đồ.'],
  ['Không bán dữ liệu, không quảng cáo', 'Thu nhập đến từ Gói Gia đình và sách in.'],
  ['Giữ nguyên lời kể gốc', 'AI chỉ sửa chính tả. Luôn có đoạn ghi âm gốc để kiểm chứng.'],
  ['Khuôn mặt xử lý trên máy', 'Nhận diện người trong ảnh (sắp có) chạy ngay trên điện thoại, không gửi lên máy chủ.'],
];

// Tóm tắt cam kết quyền riêng tư. Văn bản pháp lý chính thức cần luật sư soạn theo
// Luật Bảo vệ dữ liệu cá nhân của Việt Nam (hiệu lực 1/1/2026) và PIPA của Hàn Quốc;
// phần AI theo Luật AI của Hàn Quốc (22/1/2026) và Luật Trí tuệ nhân tạo của Việt Nam (1/3/2026).
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
        Kho nhà mình là của gia đình bạn: tải toàn bộ ảnh, ghi âm và video về máy bất cứ lúc nào, kể cả khi thôi dùng app. Xoá tài khoản là xoá mọi dữ liệu.
      </T>
      <SectionHeader title="Ghi công" />
      <T variant="small" color={colors.muted}>
        Avatar của gia đình mẫu: Avataaars của Pablo Stanley, dùng tự do cho cả mục đích thương mại. Giao diện lấy cảm hứng từ bản thiết kế MAD (Social Dares) của Nixtio. Chữ: Be Vietnam Pro (SIL Open Font License). Icon: Ionicons (MIT).
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { gap: 4 } });
