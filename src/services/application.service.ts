import { listApplications } from "./application/list";
import { createApplication } from "./application/create";
import { acceptApplication, rejectApplication } from "./application/action";

export class ApplicationService {
  static listApplications = listApplications;
  static createApplication = createApplication;
  static acceptApplication = acceptApplication;
  static rejectApplication = rejectApplication;
}
