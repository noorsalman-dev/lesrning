extends Node2D

const PLAYER_SCENE = preload("res://scene/character_body_2d.tscn")

class LevelPortal extends Area2D:
	func _draw() -> void:
		draw_arc(Vector2.ZERO, 23.0, 0.0, TAU, 48, Color(0.35, 0.95, 1.0), 5.0, true)
		draw_arc(Vector2.ZERO, 15.0, 0.0, TAU, 48, Color(0.75, 0.45, 1.0), 3.0, true)
		draw_circle(Vector2.ZERO, 7.0, Color(0.85, 0.98, 1.0, 0.8))

class DirectionArrow extends Node2D:
	func _draw() -> void:
		var points := PackedVector2Array([
			Vector2(0, -22), Vector2(-12, 5), Vector2(-4, 3),
			Vector2(-4, 19), Vector2(4, 19), Vector2(4, 3), Vector2(12, 5)
		])
		draw_colored_polygon(points, Color(1.0, 0.78, 0.25))
		draw_polyline(PackedVector2Array([
			Vector2(0, -22), Vector2(-12, 5), Vector2(-4, 3),
			Vector2(-4, 19), Vector2(4, 19), Vector2(4, 3), Vector2(12, 5), Vector2(0, -22)
		]), Color(0.12, 0.16, 0.18), 2.0, true)

var player: CharacterBody2D
var portal: Area2D
var current_level := 0
var transitioning := false
var generated_nodes: Array[Node] = []
var level_label: Label
var direction_arrow: DirectionArrow
var random := RandomNumberGenerator.new()


func _ready() -> void:
	random.randomize()
	player = PLAYER_SCENE.instantiate() as CharacterBody2D
	add_child(player)
	_build_hud()
	_build_level()


func _process(_delta: float) -> void:
	if not is_instance_valid(portal) or not is_instance_valid(player):
		return

	var viewport_size := get_viewport_rect().size
	direction_arrow.position = Vector2(viewport_size.x - 52.0, 54.0)
	var player_screen_position := player.get_global_transform_with_canvas().origin
	var portal_screen_position := portal.get_global_transform_with_canvas().origin
	var direction := portal_screen_position - player_screen_position
	if direction.length_squared() > 0.1:
		direction_arrow.rotation = direction.angle() + PI / 2.0


func _build_hud() -> void:
	var hud := CanvasLayer.new()
	add_child(hud)

	level_label = Label.new()
	level_label.position = Vector2(20.0, 16.0)
	level_label.add_theme_font_size_override("font_size", 22)
	level_label.add_theme_color_override("font_color", Color(0.92, 0.96, 1.0))
	hud.add_child(level_label)

	direction_arrow = DirectionArrow.new()
	hud.add_child(direction_arrow)


func _build_level() -> void:
	for node in generated_nodes:
		if is_instance_valid(node):
			node.queue_free()
	generated_nodes.clear()
	portal = null
	transitioning = false

	current_level += 1
	level_label.text = "LEVEL %d" % current_level
	var stage_hue := random.randf()
	var platform_end_x := 320.0
	var platform_top_y := 160.0
	_add_platform(160.0, platform_top_y, 320.0, _platform_color(stage_hue, 0))

	for index in range(5):
		var gap := random.randf_range(35.0, 80.0)
		var width := random.randf_range(170.0, 270.0)
		var center_x := platform_end_x + gap + width / 2.0
		platform_top_y = clampf(platform_top_y + random.randf_range(-70.0, 70.0), 45.0, 220.0)
		_add_platform(center_x, platform_top_y, width, _platform_color(stage_hue, index + 1))
		platform_end_x = center_x + width / 2.0

	portal = LevelPortal.new()
	portal.collision_layer = 0
	portal.collision_mask = 2
	portal.position = Vector2(platform_end_x - 30.0, platform_top_y - 27.0)
	var portal_shape := CollisionShape2D.new()
	var portal_circle := CircleShape2D.new()
	portal_circle.radius = 24.0
	portal_shape.shape = portal_circle
	portal.add_child(portal_shape)
	portal.body_entered.connect(_on_portal_body_entered)
	add_child(portal)
	generated_nodes.append(portal)
	portal.queue_redraw()

	player.position = Vector2(80.0, 154.0)
	player.velocity = Vector2.ZERO


func _add_platform(center_x: float, top_y: float, width: float, color: Color) -> void:
	var platform := StaticBody2D.new()
	platform.position = Vector2(center_x, top_y + 12.0)
	platform.collision_layer = 1

	var collision := CollisionShape2D.new()
	var rectangle := RectangleShape2D.new()
	rectangle.size = Vector2(width, 24.0)
	collision.shape = rectangle
	platform.add_child(collision)

	var surface := Polygon2D.new()
	surface.polygon = PackedVector2Array([
		Vector2(-width / 2.0, -12.0), Vector2(width / 2.0, -12.0),
		Vector2(width / 2.0, 12.0), Vector2(-width / 2.0, 12.0)
	])
	surface.color = color
	platform.add_child(surface)

	var highlight := Polygon2D.new()
	highlight.polygon = PackedVector2Array([
		Vector2(-width / 2.0, -12.0), Vector2(width / 2.0, -12.0),
		Vector2(width / 2.0, -7.0), Vector2(-width / 2.0, -7.0)
	])
	highlight.color = Color(1.0, 1.0, 1.0, 0.32)
	platform.add_child(highlight)

	add_child(platform)
	generated_nodes.append(platform)


func _platform_color(stage_hue: float, platform_index: int) -> Color:
	return Color.from_hsv(fposmod(stage_hue + platform_index * 0.035, 1.0), 0.68, 0.88)


func _on_portal_body_entered(body: Node2D) -> void:
	if body == player and not transitioning:
		transitioning = true
		call_deferred("_build_level")