import { ListPageSkeleton } from '@/components/dashboard/page-skeletons'

export default function Loading() {
  return <ListPageSkeleton withStats rows={10} />
}
