import { Navigate } from "react-router-dom";
import { getDefaultAppPath } from "../api";
import { useUserContext } from "../context/UserContext";

export default function ProfileRedirect() {
  const { user } = useUserContext();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={getDefaultAppPath(user)} replace />;
}
