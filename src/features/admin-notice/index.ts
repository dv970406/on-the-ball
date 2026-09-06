export { NoticeForm } from "./ui/notice-form";
// ⚠ `NoticeDraft`는 올리지 않는다(폼 초기값을 인라인으로 넘긴다 — 슬라이스 밖 소비 0)
export { type NoticeInput } from "./lib/notice-schema";
export {
  useCreateNotice,
  useDeleteNotice,
  useRestoreNotice,
  useUpdateNotice,
} from "./model/use-admin-notice-mutations";
