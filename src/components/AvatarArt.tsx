export type AvatarStyle = 'blocky' | 'pixel' | 'voxel' | 'lowpoly'

type AvatarArtProps = {
  variant?: AvatarStyle
  className?: string
}

/** Original, self-contained artwork; safe to repeat at any size on the page. */
export function AvatarArt({ variant = 'blocky', className = '' }: AvatarArtProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="240" height="240" rx="24" fill="#191E1D" />
      <path d="M0 172 240 34V97L0 235Z" fill="#212A23" />
      <path d="M21 41H37M29 33V49M202 185H218M210 177V193" stroke="#66764E" strokeWidth="2" />
      <path d="M192 27H207V42M20 197V212H35" stroke="#394835" strokeWidth="2" />
      {variant === 'blocky' && <BlockyPortrait />}
      {variant === 'pixel' && <PixelPortrait />}
      {variant === 'voxel' && <VoxelPortrait />}
      {variant === 'lowpoly' && <LowPolyPortrait />}
    </svg>
  )
}

function BlockyPortrait() {
  return (
    <g>
      <ellipse cx="121" cy="231" rx="94" ry="12" fill="#101512" />
      {/* The jacket and its shaded side sit behind the cuboid head. */}
      <path d="M79 158 115 158 153 180 151 240H26L30 199 48 176Z" fill="#AEF44D" />
      <path d="M153 180 179 163 202 185 218 240H151Z" fill="#65982D" />
      <path d="M48 176 66 188 55 240H26L30 199Z" fill="#87C73B" />
      <path d="M79 158 98 174 115 158 132 170 119 203 76 189 62 174Z" fill="#C4FF75" />
      <path d="M78 173 98 183 117 173 128 240H72Z" fill="#1A2520" />
      <path d="M98 183V240" stroke="#3C4F36" strokeWidth="3" />
      <path d="M48 199 38 234M165 191 177 231" stroke="#D0FF89" strokeWidth="3" />
      <path d="M131 211H143V225H131Z" fill="#273820" />
      <path d="M133 213H139V219H133Z" fill="#B2F360" />
      <path d="M82 139H113V167L98 178 82 166Z" fill="#D49A63" />
      <path d="M98 139H113V167L98 178Z" fill="#AA6C43" />
      {/* Front, right, and top planes of the head. */}
      <path d="M56 63H138V149H56Z" fill="#EBC291" />
      <path d="M138 63 181 35V121L138 149Z" fill="#B17B52" />
      <path d="M56 63 99 35H181L138 63Z" fill="#986848" />
      <path d="M56 63H138V87H120V79H99V88H79V101H56Z" fill="#68452F" />
      <path d="M56 63 99 35H181L138 63Z" fill="#916346" />
      <path d="M69 55 99 35H142L112 55Z" fill="#B17B53" />
      <path d="M138 63 181 35V72L160 86V105L147 113V85L138 91Z" fill="#50382A" />
      <path d="M147 68 171 52" stroke="#79513A" strokeWidth="5" />
      <path d="M56 103H64V129H56Z" fill="#DCA875" />
      <path d="M138 108 148 102V124L138 131Z" fill="#E0AD79" />
      <path d="M142 111 146 109V118L142 121Z" fill="#AE744D" />
      <path d="M70 101H88V112H70ZM108 101H126V112H108Z" fill="#FFF2D6" />
      <path d="M80 101H88V112H80ZM108 101H116V112H108Z" fill="#28392F" />
      <path d="M70 96H88M108 96H126" stroke="#6C4933" strokeWidth="4" />
      <path d="M95 112H103V123H95Z" fill="#C88C5D" />
      <path d="M83 133H113V138H83Z" fill="#9B6141" />
      <path d="M88 133H108V135H88Z" fill="#FFE1B4" />
      <path d="M56 141H76V149H56ZM124 138H138V149H124Z" fill="#D4A06E" />
      <path d="M164 156 173 150 182 155 173 161Z" fill="#D4FF96" />
      <path d="M173 161 182 155V164L173 170Z" fill="#7FBA3D" />
      <path d="M164 156 173 161V170L164 165Z" fill="#ADDF6C" />
    </g>
  )
}

function PixelPortrait() {
  return (
    <g shapeRendering="crispEdges">
      <path d="M43 224H205V240H35V208H43Z" fill="#101512" />
      <path d="M72 160H160V168H176V176H192V192H200V240H40V192H48V176H64V168H72Z" fill="#8CD74B" />
      <path d="M160 168H176V176H192V192H200V240H168V192H160Z" fill="#4F8138" />
      <path d="M64 176H80V192H72V240H40V192H48V184H64Z" fill="#B6F56E" />
      <path d="M88 160H152V176H144V184H136V240H104V192H96V184H88Z" fill="#F5E7C5" />
      <path d="M104 176H136V184H144V240H96V184H104Z" fill="#27352B" />
      <path d="M112 184H128V192H112ZM112 208H128V216H112Z" fill="#BAF473" />
      <path d="M96 144H144V168H136V176H104V168H96Z" fill="#BE895D" />
      <path d="M72 48H88V40H144V48H160V56H168V72H176V128H168V144H152V152H88V144H72V128H64V72H72Z" fill="#E5B783" />
      <path d="M144 64H168V80H176V128H168V144H152V152H136V136H152V112H160V88H144Z" fill="#C38F5F" />
      <path d="M64 80H72V112H64ZM56 96H64V120H56ZM176 96H184V120H176Z" fill="#E5B783" />
      <path d="M72 48H88V40H144V48H160V56H168V88H152V72H136V80H112V72H96V88H80V104H64V72H72Z" fill="#E9E5CB" />
      <path d="M88 40H144V48H160V56H112V64H88V72H72V56H88Z" fill="#FFF7DC" />
      <path d="M152 56H168V88H152ZM136 64H152V72H136ZM64 88H80V104H64Z" fill="#B7C5A7" />
      <path d="M80 96H104V112H80ZM128 96H152V112H128Z" fill="#FFF3D5" />
      <path d="M88 96H104V112H88ZM128 96H144V112H128Z" fill="#28392D" />
      <path d="M88 96H96V104H88ZM128 96H136V104H128Z" fill="#9AE969" />
      <path d="M112 112H120V128H112Z" fill="#C38F5F" />
      <path d="M96 136H136V144H96Z" fill="#895D41" />
      <path d="M104 136H128V140H104Z" fill="#FFF0C5" />
      <path d="M48 144H56V152H48ZM184 56H192V64H184ZM192 64H200V72H192ZM32 112H40V120H32Z" fill="#C7F789" />
      <path d="M160 208H176V224H160Z" fill="#2B482A" />
      <path d="M164 212H172V220H164Z" fill="#BAF473" />
    </g>
  )
}

function VoxelPortrait() {
  return (
    <g>
      <ellipse cx="122" cy="231" rx="93" ry="12" fill="#101512" />
      <path d="M48 177 109 155 178 173 148 199 35 219Z" fill="#A1F4CB" />
      <path d="M35 195 107 176 148 196V240H27Z" fill="#70D8AF" />
      <path d="M148 196 178 173 205 197 217 240H148Z" fill="#29997D" />
      <path d="M48 177 68 184 58 205 35 212 35 195Z" fill="#B5FFDA" />
      <path d="M68 184 82 188 72 240H48Z" fill="#48B88F" />
      <path d="M87 170 110 161 134 177 124 190 102 194Z" fill="#163C34" />
      <path d="M102 194 124 190 132 240H98Z" fill="#225044" />
      <path d="M86 142 114 134 127 144V171L106 182 86 171Z" fill="#D99E7E" />
      <path d="M106 151 127 144V171L106 182Z" fill="#A56D62" />
      <path d="M58 66 135 50 135 143 58 155Z" fill="#F0C3A3" />
      <path d="M135 50 181 72V160L135 143Z" fill="#C18A76" />
      <path d="M58 66 103 38 181 72 135 91Z" fill="#E5A998" />
      <path d="M52 57 105 28 187 60 135 86Z" fill="#B9A0E7" />
      <path d="M52 57 135 77V102L116 97V81L95 77V92L74 87V104L52 99Z" fill="#8A6CB9" />
      <path d="M135 77 187 60V99L168 106V127L151 132V99L135 104Z" fill="#614B8D" />
      <path d="M52 57 105 28 126 36 73 64Z" fill="#D5BEEF" />
      <path d="M92 68 144 44 165 52 113 74Z" fill="#C6A9ED" />
      <path d="M58 96 71 99V124L58 121Z" fill="#DEA98B" />
      <path d="M71 107 91 111V122L71 118Z" fill="#FFF1D8" />
      <path d="M108 115 128 118V129L108 126Z" fill="#FFF1D8" />
      <path d="M82 109 91 111V122L82 120ZM108 115 117 117V128L108 126Z" fill="#384336" />
      <path d="M71 102 91 106M108 109 128 113" stroke="#6D4D64" strokeWidth="4" />
      <path d="M98 121 105 123V135L98 133Z" fill="#CA8D72" />
      <path d="M83 137 114 143V148L83 142Z" fill="#A06E59" />
      <path d="M135 132 148 136V150L135 145Z" fill="#E6AD8D" />
      <path d="M140 137 146 139V144L140 142Z" fill="#A77361" />
      <path d="M152 112 164 108V120L152 124Z" fill="#E5E7AE" />
      <path d="M164 108 169 112V123L164 120Z" fill="#AEB879" />
      <path d="M160 204 179 198V215L160 221Z" fill="#174E42" />
      <path d="M165 207 174 204V212L165 215Z" fill="#B9F677" />
      <path d="M23 153 35 146 47 153 35 160Z" fill="#D5BEEF" />
      <path d="M23 153 35 160V173L23 166Z" fill="#9675C1" />
      <path d="M35 160 47 153V166L35 173Z" fill="#614B8D" />
    </g>
  )
}

function LowPolyPortrait() {
  return (
    <g>
      <ellipse cx="122" cy="231" rx="93" ry="12" fill="#101512" />
      <path d="M78 161 117 155 169 177 201 214 213 240H26L41 194Z" fill="#E5D9AF" />
      <path d="M78 161 100 182 60 207 41 194Z" fill="#F6EDCE" />
      <path d="M117 155 169 177 148 202 100 182Z" fill="#C9C294" />
      <path d="M169 177 201 214 171 240 148 202Z" fill="#8F986C" />
      <path d="M148 202 171 240H116L100 182Z" fill="#B8C18B" />
      <path d="M60 207 100 182 84 240H26Z" fill="#CBC59D" />
      <path d="M100 182 116 240H84Z" fill="#334B38" />
      <path d="M83 142 112 136 130 154 114 177 100 182 82 167Z" fill="#CD936B" />
      <path d="M112 136 130 154 114 177 100 182Z" fill="#AB7255" />
      <path d="M59 66 84 40 132 34 168 56 180 97 162 132 122 157 82 145 57 113Z" fill="#EAB78A" />
      <path d="M59 66 97 65 83 101 57 113Z" fill="#F6D2A6" />
      <path d="M97 65 137 66 120 104 83 101Z" fill="#F2C69A" />
      <path d="M137 66 168 56 180 97 153 105Z" fill="#C99673" />
      <path d="M120 104 137 66 153 105 141 137Z" fill="#DBA47E" />
      <path d="M153 105 180 97 162 132 141 137Z" fill="#B47E60" />
      <path d="M83 101 120 104 111 126 82 145 57 113Z" fill="#E5B183" />
      <path d="M111 126 141 137 122 157 82 145Z" fill="#D49B73" />
      <path d="M120 104 128 121 111 126Z" fill="#C88D68" />
      <path d="M59 66 62 49 86 29 130 24 167 44 177 68 145 61 132 44 100 66 80 57 63 92Z" fill="#C97942" />
      <path d="M62 49 86 29 130 24 100 46Z" fill="#E7A466" />
      <path d="M100 46 130 24 167 44 132 44 100 66Z" fill="#D78C4D" />
      <path d="M145 61 167 44 177 68 171 93 160 81Z" fill="#925834" />
      <path d="M63 92 59 66 80 57 73 88Z" fill="#AB673E" />
      <path d="M72 96 94 94 93 103 74 104Z" fill="#FFF0D1" />
      <path d="M126 96 146 100 143 108 125 105Z" fill="#F5DEB7" />
      <path d="M84 95 94 94 93 103 84 103ZM126 96 135 98 134 106 125 105Z" fill="#344A35" />
      <path d="M72 89 94 86M127 88 147 93" stroke="#825338" strokeWidth="3" />
      <path d="M96 134 121 136 112 141 101 140Z" fill="#855540" />
      <path d="M96 134 121 136 105 137Z" fill="#FFE4B6" />
      <path d="M167 102 176 98 174 113 162 124Z" fill="#DEA880" />
      <path d="M171 102 173 102 170 111 166 115Z" fill="#B68163" />
      <path d="M50 220 57 208 65 222 58 232Z" fill="#BDFA70" />
      <path d="M57 208 65 222 58 232Z" fill="#8EB654" />
      <path d="M194 133 204 125 208 139 200 148Z" fill="#D3EC99" />
      <path d="M194 133 200 148 190 143Z" fill="#7DA45B" />
    </g>
  )
}
