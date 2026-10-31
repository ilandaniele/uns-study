import journal from './meta/_journal.json';
import m0000 from './0000_baseline.sql';
import m0001 from './0001_drop_redundant_indexes.sql';
import m0002 from './0002_feedback.sql';
import m0003 from './0003_pro_features.sql';
import m0004 from './0004_pro_features_2.sql';
import m0005 from './0005_user_shields.sql';
import m0006 from './0006_native_garden.sql';
import m0007 from './0007_garden_payments.sql';
import m0008 from './0008_message_reactions.sql';
import m0009 from './0009_shared_gardens.sql';
import m0010 from './0010_section_usage.sql';
import m0011 from './0011_community_achievements.sql';
import m0012 from './0012_garden_landscapes_focus.sql';
import m0013 from './0013_owner_seed_gifts.sql';
import m0014 from './0014_people_friends.sql';
import m0015 from './0015_simple_room_mode.sql';
import m0016 from './0016_seat_qr_presence.sql';
import m0017 from './0017_collaboration_rewards.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009,
m0010,
m0011,
m0012,
m0013,
m0014,
m0015,
m0016,
m0017
    }
  }
