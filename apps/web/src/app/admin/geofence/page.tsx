import { GeofenceAdmin } from "@/features/admin/GeofenceAdmin";
import { PhotoVerifierStatus } from "@/features/admin/PhotoVerifierStatus";

export default function AdminGeofencePage() {
  return <><GeofenceAdmin roomSlug="principal" /><PhotoVerifierStatus/></>;
}
