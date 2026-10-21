import { useLocalSearchParams } from 'expo-router';
import { PersonView } from '@/components/Understand';
import { BackHeader, Empty, Screen } from '@/components/ui';
import { canUnderstand, me, member } from '@/lib/selectors';
import { useApp } from '@/store/AppContext';

// Trang "Hiểu về một người", mở từ danh sách gia đình. Chỉ người khác thế hệ mới xem được.
export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useApp();
  const m = member(state, id ?? '');
  if (!m) return <Screen><BackHeader /><Empty icon="person-outline" title="Không tìm thấy người này" /></Screen>;
  if (!canUnderstand(me(state), m)) {
    return (
      <Screen>
        <BackHeader title={m.roleLabel} />
        <Empty icon="lock-closed-outline" title="Trang này dành cho người khác thế hệ"
          text="Con xem trang của bố mẹ, bố mẹ xem trang của con. Vì câu hỏi được giấu tên, người cùng thế hệ không xem trang của nhau." />
      </Screen>
    );
  }
  return (
    <Screen>
      <BackHeader title={m.roleLabel} />
      <PersonView id={m.id} />
    </Screen>
  );
}
