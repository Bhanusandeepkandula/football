import ActivityKit
import Foundation

// ⚠️ MUST stay identical to modules/live-activity/ios/MatchActivityAttributes.swift.
// ActivityKit matches the app process and this widget extension by the shape of
// this type — if the two copies drift, the widget stops receiving updates.
struct MatchActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var homeAbbr: String
    var awayAbbr: String
    var homeScore: Int
    var awayScore: Int
    var status: String
    var isLive: Bool
    var homeColor: String
    var awayColor: String
    var lastEvent: String
  }

  var matchId: String
  var homeName: String
  var awayName: String
}
