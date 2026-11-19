import { FileExplorerScreen } from '@/components/explorer/FileExplorerScreen';

/** "Shared" tab: files and folders other ShareSync users shared with you. */
export default function SharedScreen() {
  return <FileExplorerScreen mode="shared" />;
}
