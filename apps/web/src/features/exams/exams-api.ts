import type { ExamDto, ExamPatch, ExamRequest, ExamsDto } from "@sala/contracts";
import { apiDelete, apiFetch, apiPatch, apiPost, enc } from "@/features/pro/pro-api";

export const getExams = () => apiFetch<ExamsDto>("/api/v1/me/exams");
export const createExam = (input: ExamRequest) => apiPost<ExamDto>("/api/v1/me/exams", input);
export const updateExam = (id: string, patch: ExamPatch) => apiPatch<ExamDto>(`/api/v1/me/exams/${enc(id)}`, patch);
export const deleteExam = (id: string) => apiDelete<void>(`/api/v1/me/exams/${enc(id)}`);
