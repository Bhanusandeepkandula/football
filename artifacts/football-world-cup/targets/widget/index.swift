import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Color helper

extension Color {
  init(hex: String) {
    let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var rgb: UInt64 = 0
    Scanner(string: s).scanHexInt64(&rgb)
    let r = Double((rgb >> 16) & 0xFF) / 255
    let g = Double((rgb >> 8) & 0xFF) / 255
    let b = Double(rgb & 0xFF) / 255
    self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
  }

  // Apple HIG: content on the always-black Dynamic Island must stay legible.
  // Dark team colours (navy, maroon…) are lifted toward white so they don't
  // vanish against the black background.
  static func legible(hex: String) -> Color {
    let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    var rgb: UInt64 = 0
    Scanner(string: s).scanHexInt64(&rgb)
    var r = Double((rgb >> 16) & 0xFF) / 255
    var g = Double((rgb >> 8) & 0xFF) / 255
    var b = Double(rgb & 0xFF) / 255
    let lum = 0.299 * r + 0.587 * g + 0.114 * b
    if lum < 0.55 {
      let t = 0.6
      r += (1 - r) * t
      g += (1 - g) * t
      b += (1 - b) * t
    }
    return Color(.sRGB, red: r, green: g, blue: b, opacity: 1)
  }
}

// MARK: - Widget bundle entry point

@main
struct MatchWidgetBundle: WidgetBundle {
  var body: some Widget {
    MatchLiveActivityWidget()
  }
}

// MARK: - Shared foreground views (no background — pure island canvas)

@available(iOS 16.2, *)
struct TeamColumn: View {
  let abbr: String
  let score: Int
  let hex: String
  var big: Bool = true

  var body: some View {
    VStack(spacing: 3) {
      HStack(spacing: 4) {
        Circle().fill(Color.legible(hex: hex)).frame(width: 7, height: 7)
        Text(abbr)
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
      }
      Text("\(score)")
        .font(.system(size: big ? 30 : 22, weight: .heavy, design: .rounded))
        .foregroundColor(.white)
        .monospacedDigit()
    }
  }
}

@available(iOS 16.2, *)
struct CenterStatus: View {
  let status: String
  let isLive: Bool

  var body: some View {
    VStack(spacing: 3) {
      if isLive {
        HStack(spacing: 4) {
          Circle().fill(Color.red).frame(width: 5, height: 5)
          Text("LIVE").font(.system(size: 9, weight: .heavy)).foregroundColor(.red)
        }
      }
      Text(status)
        .font(.system(size: 15, weight: .bold, design: .rounded))
        .foregroundColor(.white)
        .monospacedDigit()
    }
  }
}

// MARK: - Lock Screen / banner presentation (background IS allowed here)

@available(iOS 16.2, *)
struct LockScreenLiveActivityView: View {
  let context: ActivityViewContext<MatchActivityAttributes>

  var body: some View {
    VStack(spacing: 8) {
      HStack(alignment: .center) {
        TeamColumn(abbr: context.state.homeAbbr, score: context.state.homeScore, hex: context.state.homeColor)
        Spacer()
        CenterStatus(status: context.state.status, isLive: context.state.isLive)
        Spacer()
        TeamColumn(abbr: context.state.awayAbbr, score: context.state.awayScore, hex: context.state.awayColor)
      }
      if !context.state.lastEvent.isEmpty {
        Text(context.state.lastEvent)
          .font(.system(size: 12, weight: .medium))
          .foregroundColor(.white.opacity(0.85))
          .lineLimit(1)
      }
    }
    .padding(14)
  }
}

// MARK: - Live Activity + Dynamic Island

@available(iOS 16.2, *)
struct MatchLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MatchActivityAttributes.self) { context in
      LockScreenLiveActivityView(context: context)
        .activityBackgroundTint(Color.black.opacity(0.55))
        .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      DynamicIsland {
        // EXPANDED — leading/trailing hold each team, center the clock, bottom
        // the latest moment. No background: foreground elements only.
        DynamicIslandExpandedRegion(.leading) {
          TeamColumn(abbr: context.state.homeAbbr, score: context.state.homeScore, hex: context.state.homeColor)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          TeamColumn(abbr: context.state.awayAbbr, score: context.state.awayScore, hex: context.state.awayColor)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          CenterStatus(status: context.state.status, isLive: context.state.isLive)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if !context.state.lastEvent.isEmpty {
            Text(context.state.lastEvent)
              .font(.system(size: 12, weight: .medium))
              .foregroundColor(.white.opacity(0.9))
              .lineLimit(1)
              .frame(maxWidth: .infinity)
              .padding(.top, 2)
          }
        }
      } compactLeading: {
        // Home abbr + score, hugging the leading edge of the sensor.
        HStack(spacing: 3) {
          Text(context.state.homeAbbr)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(Color.legible(hex: context.state.homeColor))
          Text("\(context.state.homeScore)")
            .font(.system(size: 14, weight: .heavy))
            .foregroundColor(.white)
            .monospacedDigit()
        }
      } compactTrailing: {
        // Away score + abbr on the trailing edge.
        HStack(spacing: 3) {
          Text("\(context.state.awayScore)")
            .font(.system(size: 14, weight: .heavy))
            .foregroundColor(.white)
            .monospacedDigit()
          Text(context.state.awayAbbr)
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(Color.legible(hex: context.state.awayColor))
        }
      } minimal: {
        // Single glanceable element when multiple activities compete.
        Text("\(context.state.homeScore)–\(context.state.awayScore)")
          .font(.system(size: 12, weight: .heavy))
          .foregroundColor(.white)
          .monospacedDigit()
      }
      .keylineTint(Color.legible(hex: context.state.homeColor))
    }
  }
}
