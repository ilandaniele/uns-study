import journal from './meta/_journal.json';
import m0000 from './0000_baseline.sql';
import m0001 from './0001_drop_redundant_indexes.sql';
import m0002 from './0002_feedback.sql';
import m0003 from './0003_pro_features.sql';
import m0004 from './0004_pro_features_2.sql';
import m0005 from './0005_user_shields.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005
    }
  }
  